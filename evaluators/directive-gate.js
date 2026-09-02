'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const directiveSpineSchema = require('../schemas/directive-spine.schema.json');

const GATE_RANK = {ALLOW: 0, REVIEW: 1, HALT: 2};

function createValidator(schema) {
  const ajv = new Ajv({allErrors: true, strict: false, validateSchema: false});
  addFormats(ajv);
  return ajv.compile(schema);
}

const validateDirectiveSpine = createValidator(directiveSpineSchema);
const validateAsOf = createValidator({type: 'string', format: 'date-time'});

function schemaErrors(validate) {
  return (validate.errors || []).map((error) => `${error.instancePath || '/'}: ${error.message}`);
}

function parseRfc3339(value) {
  const parts = /^(\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:)(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;

  const second = Number(parts[2]);
  const baseSecond = second === 60 ? 59 : second;
  const baseMilliseconds = Date.parse(`${parts[1]}${String(baseSecond).padStart(2, '0')}${parts[4]}`);
  if (!Number.isFinite(baseMilliseconds)) return null;

  return {
    whole_seconds: BigInt(baseMilliseconds / 1000) + (second === 60 ? 1n : 0n),
    fractional_digits: (parts[3] || '').replace(/0+$/, '')
  };
}

function compareInstants(left, right) {
  if (left.whole_seconds < right.whole_seconds) return -1;
  if (left.whole_seconds > right.whole_seconds) return 1;

  const width = Math.max(left.fractional_digits.length, right.fractional_digits.length);
  const leftFraction = left.fractional_digits.padEnd(width, '0');
  const rightFraction = right.fractional_digits.padEnd(width, '0');
  if (leftFraction < rightFraction) return -1;
  if (leftFraction > rightFraction) return 1;
  return 0;
}

function finding(code, gate, path, message) {
  return {code, gate, path, message};
}

function recordFailure(code, path, message) {
  return {code, path, message};
}

function maxGate(findings) {
  return findings.reduce(
    (gate, item) => GATE_RANK[item.gate] > GATE_RANK[gate] ? item.gate : gate,
    'ALLOW'
  );
}

function resultFor(directiveSpine, asOf, computedGate, findings, recordFailures, checks) {
  return {
    directive_spine_id: directiveSpine && directiveSpine.directive_spine_id ? directiveSpine.directive_spine_id : null,
    correlation_id: directiveSpine && directiveSpine.correlation_id ? directiveSpine.correlation_id : null,
    as_of: typeof asOf === 'string' ? asOf : null,
    declared_gate: directiveSpine && directiveSpine.gate_decision ? directiveSpine.gate_decision.state || null : null,
    computed_gate: computedGate,
    record_verdict: recordFailures.length ? 'FAIL' : 'PASS',
    checks,
    findings,
    record_failures: recordFailures
  };
}

function invalidResult(directiveSpine, asOf, code, path, message, schemaValid, asOfValid) {
  return resultFor(
    directiveSpine,
    asOf,
    'HALT',
    [finding(code, 'HALT', path, message)],
    [recordFailure('INPUT_INVALID', path, message)],
    {schema_valid: schemaValid, as_of_valid: asOfValid, declared_gate_matches: false}
  );
}

function evaluate(directiveSpine, asOf) {
  if (!validateDirectiveSpine(directiveSpine)) {
    return invalidResult(
      directiveSpine,
      asOf,
      'DIRECTIVE_MALFORMED',
      '/',
      `Directive Spine record is malformed: ${schemaErrors(validateDirectiveSpine).join('; ')}`,
      false,
      validateAsOf(asOf)
    );
  }
  if (!validateAsOf(asOf)) {
    return invalidResult(
      directiveSpine,
      asOf,
      'INVALID_AS_OF',
      '/as_of',
      `Evaluation time is malformed: ${schemaErrors(validateAsOf).join('; ')}`,
      true,
      false
    );
  }

  const findings = [];
  const recordFailures = [];
  const asOfInstant = parseRfc3339(asOf);
  const expiresAtInstant = parseRfc3339(directiveSpine.intent.expires_at);
  const decidedAtInstant = parseRfc3339(directiveSpine.gate_decision.decided_at);
  if (!asOfInstant || !expiresAtInstant || !decidedAtInstant) {
    return invalidResult(
      directiveSpine,
      asOf,
      'UNSUPPORTED_TEMPORAL_VALUE',
      '/',
      'A schema-valid temporal value could not be normalized for exact comparison',
      true,
      true
    );
  }

  if (compareInstants(decidedAtInstant, asOfInstant) > 0) {
    findings.push(finding(
      'DECISION_AFTER_AS_OF',
      'HALT',
      '/gate_decision/decided_at',
      'Declared gate decision occurs after the evaluation time'
    ));
  }
  if (compareInstants(asOfInstant, expiresAtInstant) >= 0) {
    findings.push(finding(
      'DIRECTIVE_EXPIRED',
      'HALT',
      '/intent/expires_at',
      'Directive is expired at or after intent.expires_at'
    ));
  }

  const proposalStatus = directiveSpine.intent.proposal_status;
  if (proposalStatus === 'proposed') {
    findings.push(finding('PROPOSAL_PENDING', 'REVIEW', '/intent/proposal_status', 'Directive intent remains proposed'));
  } else if (['rejected', 'expired', 'superseded'].includes(proposalStatus)) {
    findings.push(finding(
      'PROPOSAL_TERMINAL',
      'HALT',
      '/intent/proposal_status',
      `Directive intent is terminal: ${proposalStatus}`
    ));
  }

  const authority = directiveSpine.authority;
  const approvalMetadataPresent = ['approver', 'approved_at', 'authority_evidence_ref']
    .some((key) => Object.prototype.hasOwnProperty.call(authority, key));
  if (authority.approval_status !== 'approved' && approvalMetadataPresent) {
    findings.push(finding(
      'APPROVAL_METADATA_CONFLICT',
      'HALT',
      '/authority',
      'Non-approved authority status carries approval-only metadata'
    ));
  }

  if (authority.approval_status === 'pending') {
    findings.push(finding('APPROVAL_PENDING', 'REVIEW', '/authority/approval_status', 'Required authority approval remains pending'));
  } else if (authority.approval_status === 'rejected') {
    findings.push(finding('APPROVAL_REJECTED', 'HALT', '/authority/approval_status', 'Authority approval was explicitly rejected'));
  } else if (authority.approval_status === 'approved') {
    const approvedAtInstant = parseRfc3339(authority.approved_at);
    if (!approvedAtInstant) {
      findings.push(finding(
        'UNSUPPORTED_TEMPORAL_VALUE',
        'HALT',
        '/authority/approved_at',
        'Authority approval time could not be normalized for exact comparison'
      ));
    } else if (compareInstants(approvedAtInstant, decidedAtInstant) > 0) {
      findings.push(finding(
        'APPROVAL_AFTER_DECISION',
        'HALT',
        '/authority/approved_at',
        'Authority approval occurs after the declared gate decision'
      ));
    }
    if (approvedAtInstant && compareInstants(approvedAtInstant, asOfInstant) > 0) {
      findings.push(finding(
        'APPROVAL_AFTER_AS_OF',
        'HALT',
        '/authority/approved_at',
        'Authority approval occurs after the evaluation time'
      ));
    }
  }

  const evidenceIds = directiveSpine.evidence_snapshots.map((snapshot) => snapshot.evidence_snapshot_id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    findings.push(finding(
      'DUPLICATE_EVIDENCE_ID',
      'HALT',
      '/evidence_snapshots',
      'Directive Spine contains duplicate evidence snapshot identities'
    ));
  }

  const contemporaneousEvidence = directiveSpine.evidence_snapshots.filter((snapshot) => {
    const observedAtInstant = parseRfc3339(snapshot.observed_at);
    return observedAtInstant &&
      compareInstants(observedAtInstant, decidedAtInstant) <= 0 &&
      compareInstants(observedAtInstant, asOfInstant) <= 0;
  });
  if (!contemporaneousEvidence.length) {
    findings.push(finding(
      'NO_CONTEMPORANEOUS_EVIDENCE',
      'HALT',
      '/evidence_snapshots',
      'No evidence snapshot was observed on or before the declared gate decision and evaluation time'
    ));
  } else if (!contemporaneousEvidence.some((snapshot) => ['primary', 'internal'].includes(snapshot.classification))) {
    findings.push(finding(
      'CONTEXTUAL_ONLY_EVIDENCE',
      'REVIEW',
      '/evidence_snapshots',
      'Only contextual evidence supports the declared gate decision'
    ));
  }

  const computedGate = maxGate(findings);
  const declaredGateMatches = directiveSpine.gate_decision.state === computedGate;
  if (!declaredGateMatches) {
    recordFailures.push(recordFailure(
      'DECLARED_GATE_MISMATCH',
      '/gate_decision/state',
      `Declared ${directiveSpine.gate_decision.state} does not match computed ${computedGate}`
    ));
  }

  return resultFor(
    directiveSpine,
    asOf,
    computedGate,
    findings,
    recordFailures,
    {schema_valid: true, as_of_valid: true, declared_gate_matches: declaredGateMatches}
  );
}

module.exports = {evaluate};
