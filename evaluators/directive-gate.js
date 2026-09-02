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
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;

  const leapSecond = /^(.*T\d{2}:\d{2}):60(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!leapSecond) return Number.NaN;
  const priorSecond = Date.parse(`${leapSecond[1]}:59${leapSecond[2] || ''}${leapSecond[3]}`);
  return Number.isFinite(priorSecond) ? priorSecond + 1000 : Number.NaN;
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
  const asOfMs = parseRfc3339(asOf);
  const expiresAtMs = parseRfc3339(directiveSpine.intent.expires_at);
  const decidedAtMs = parseRfc3339(directiveSpine.gate_decision.decided_at);

  if (decidedAtMs > asOfMs) {
    findings.push(finding(
      'DECISION_AFTER_AS_OF',
      'HALT',
      '/gate_decision/decided_at',
      'Declared gate decision occurs after the evaluation time'
    ));
  }
  if (asOfMs >= expiresAtMs) {
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
    const approvedAtMs = parseRfc3339(authority.approved_at);
    if (approvedAtMs > decidedAtMs) {
      findings.push(finding(
        'APPROVAL_AFTER_DECISION',
        'HALT',
        '/authority/approved_at',
        'Authority approval occurs after the declared gate decision'
      ));
    }
    if (approvedAtMs > asOfMs) {
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
    const observedAtMs = parseRfc3339(snapshot.observed_at);
    return observedAtMs <= decidedAtMs && observedAtMs <= asOfMs;
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
