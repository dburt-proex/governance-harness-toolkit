#!/usr/bin/env node
'use strict';

const fs = require('fs');

const REQUIRED_INPUT_CLASSES = [
  'pull_request_title',
  'pull_request_body',
  'comment',
  'issue',
  'commit_message',
  'repository_file',
  'configuration_file',
  'generated_artifact',
  'dependency_metadata',
  'workflow_output',
  'external_web_content'
];

const REQUIRED_AUTHORITIES = [
  'read',
  'search',
  'execute',
  'edit',
  'github_write',
  'network',
  'credential',
  'permission',
  'merge',
  'deploy'
];

const INPUT_INVARIANTS = {
  pull_request_title: { trust: 'untrusted', verification_required: false },
  pull_request_body: { trust: 'untrusted', verification_required: false },
  comment: { trust: 'untrusted', verification_required: false },
  issue: { trust: 'untrusted', verification_required: false },
  commit_message: { trust: 'untrusted', verification_required: false },
  repository_file: { trust: 'conditional', verification_required: true },
  configuration_file: { trust: 'conditional', verification_required: true },
  generated_artifact: { trust: 'conditional', verification_required: true },
  dependency_metadata: { trust: 'conditional', verification_required: true },
  workflow_output: { trust: 'conditional', verification_required: true },
  external_web_content: { trust: 'untrusted', verification_required: true }
};

const AUTHORITY_INVARIANTS = {
  read: { effect: 'non_mutating', approval: 'policy' },
  search: { effect: 'non_mutating', approval: 'policy' },
  execute: { effect: 'consequential', approval: 'deterministic_or_human' },
  edit: { effect: 'consequential_write', approval: 'deterministic_or_human' },
  github_write: { effect: 'consequential_write', approval: 'deterministic_or_human' },
  network: { effect: 'external_effect', approval: 'deterministic_or_human' },
  credential: { effect: 'protected_boundary', approval: 'human_only' },
  permission: { effect: 'protected_boundary', approval: 'human_only' },
  merge: { effect: 'protected_boundary', approval: 'human_only' },
  deploy: { effect: 'protected_boundary', approval: 'human_only' }
};

const GATE_RANK = { ALLOW: 0, REVIEW: 1, HALT: 2 };
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/i;

function indexBy(items, key) {
  return new Map((items || []).map((item) => [item[key], item]));
}

function validatePolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['policy must be an object'];
  if (policy.default_gate !== 'REVIEW') errors.push('default_gate must be REVIEW');

  const inputs = indexBy(policy.input_trust_classes, 'class');
  const inputNames = (policy.input_trust_classes || []).map((item) => item.class);
  if (new Set(inputNames).size !== inputNames.length) errors.push('input trust classes must be unique');
  for (const name of inputNames) {
    if (!REQUIRED_INPUT_CLASSES.includes(name)) errors.push(`unsupported input trust class: ${name}`);
  }
  for (const name of REQUIRED_INPUT_CLASSES) {
    const input = inputs.get(name);
    if (!input) {
      errors.push(`missing input trust class: ${name}`);
      continue;
    }
    const expected = INPUT_INVARIANTS[name];
    if (input.trust !== expected.trust) errors.push(`${name}.trust must be ${expected.trust}`);
    if (input.verification_required !== expected.verification_required) {
      errors.push(`${name}.verification_required must be ${expected.verification_required}`);
    }
    if (input.may_authorize !== false) errors.push(`${name}.may_authorize must be false`);
  }

  const authorities = indexBy(policy.authorities, 'authority');
  const authorityNames = (policy.authorities || []).map((item) => item.authority);
  if (new Set(authorityNames).size !== authorityNames.length) errors.push('authority definitions must be unique');
  for (const name of authorityNames) {
    if (!REQUIRED_AUTHORITIES.includes(name)) errors.push(`unsupported authority definition: ${name}`);
  }
  for (const name of REQUIRED_AUTHORITIES) {
    const authority = authorities.get(name);
    if (!authority) {
      errors.push(`missing authority definition: ${name}`);
      continue;
    }
    const expected = AUTHORITY_INVARIANTS[name];
    if (authority.effect !== expected.effect) errors.push(`${name}.effect must be ${expected.effect}`);
    if (authority.approval !== expected.approval) errors.push(`${name}.approval must be ${expected.approval}`);
    if (authority.scope_required !== true) errors.push(`${name}.scope_required must be true`);
  }

  if (policy.deterministic_gate?.authority !== 'DiffWall') errors.push('DiffWall must remain the deterministic gate authority');
  if (policy.deterministic_gate?.missing_evidence !== 'REVIEW') errors.push('missing DiffWall evidence must route to REVIEW');
  if (policy.deterministic_gate?.halt_result !== 'HALT') errors.push('DiffWall HALT must remain HALT');
  if (policy.deterministic_gate?.model_override_allowed !== false) errors.push('model override of DiffWall must be prohibited');
  if (policy.action_pinning?.expectation !== 'full_commit_sha') errors.push('third-party Actions must expect full commit SHA pins');
  const exceptionIds = new Set();
  for (const exception of policy.action_pinning?.exceptions || []) {
    const required = ['exception_id', 'uses', 'ref', 'owner', 'security_rationale', 'compensating_control', 'review_date'];
    for (const field of required) {
      if (typeof exception[field] !== 'string' || exception[field].trim() === '') {
        errors.push(`pinning exception ${exception.exception_id || '<unknown>'} is missing ${field}`);
      }
    }
    if (exceptionIds.has(exception.exception_id)) errors.push(`duplicate pinning exception: ${exception.exception_id}`);
    exceptionIds.add(exception.exception_id);
  }
  return errors;
}

function matchesPath(path, pattern) {
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
  if (pattern.startsWith('*.')) return path.endsWith(pattern.slice(1)) && !path.includes('/');
  return path === pattern;
}

function isProtected(path, patterns) {
  return patterns.some((pattern) => matchesPath(path, pattern));
}

function matchingPinException(policy, action) {
  return (policy.action_pinning.exceptions || []).find((exception) =>
    exception.exception_id === action.exception_id &&
    exception.uses === action.uses &&
    exception.ref === action.ref
  );
}

function evaluate(policy, request) {
  const findings = [];
  const add = (gate, code, detail) => findings.push({ gate, code, detail });
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length) {
    for (const detail of policyErrors) add('HALT', 'invalid_policy', detail);
  }

  const trustClasses = indexBy(policy.input_trust_classes, 'class');
  for (const input of request.inputs || []) {
    const trust = trustClasses.get(input.class);
    if (!trust) {
      add('HALT', 'undefined_input_class', `input class ${input.class} has no policy definition`);
      continue;
    }
    if (input.treated_as_authoritative_instruction && trust.may_authorize !== true) {
      add('HALT', 'untrusted_input_as_authority', `${input.class} cannot grant authority or override policy`);
    }
    if (trust.verification_required && !input.verified) {
      add('REVIEW', 'input_verification_missing', `${input.class} requires provenance or integrity verification before use`);
    }
    if (trust.verification_required && input.treated_as_authoritative_instruction && !input.verified) {
      add('HALT', 'unverified_input_as_instruction', `${input.class} was not verified before instructional use`);
    }
  }

  const event = request.event || {};
  const actor = request.actor || {};
  const workflow = request.workflow || {};
  if (event.name === 'workflow_dispatch' && (!actor.authorized || !event.dispatch_authorized)) {
    add('HALT', 'unauthorized_workflow_dispatch', 'workflow_dispatch requires an explicitly authorized actor and dispatch scope');
  }

  if (event.name === 'pull_request_target' || workflow.uses_pull_request_target) {
    if (event.name !== 'pull_request_target' || workflow.uses_pull_request_target !== true) {
      add('HALT', 'inconsistent_pull_request_target', 'event and workflow pull_request_target declarations disagree');
    }
    if (workflow.checks_out_untrusted_ref || workflow.executes_untrusted_code) {
      add('HALT', 'unsafe_pull_request_target_execution', 'pull_request_target must not check out or execute an untrusted ref');
    }
    if ((actor.fork || actor.class === 'external_contributor') && workflow.write_permissions) {
      add('HALT', 'unsafe_pull_request_target_permissions', 'fork or external pull_request_target execution must not receive write permissions');
    }
  }

  if (event.name === 'pull_request' && (actor.fork || actor.class === 'external_contributor') && workflow.write_permissions) {
    add('HALT', 'unsafe_external_pull_request_permissions', 'external pull_request execution must not receive write permissions');
  }

  const workflowAuthorityRequirements = [
    ['checks_out_untrusted_ref', 'read'],
    ['executes_untrusted_code', 'execute'],
    ['write_permissions', 'github_write']
  ];
  for (const [flag, authority] of workflowAuthorityRequirements) {
    if (workflow[flag] && request.authority?.[authority]?.requested !== true) {
      add('HALT', 'undeclared_workflow_authority', `${flag} requires an explicit ${authority} authority grant`);
    }
  }

  const authorityDefinitions = indexBy(policy.authorities, 'authority');
  const requestedAuthorities = [];
  const humanApprovalStatus = request.gates.human_approval.status;
  for (const name of REQUIRED_AUTHORITIES) {
    const grant = request.authority?.[name];
    if (!grant?.requested) continue;
    requestedAuthorities.push(name);
    const definition = authorityDefinitions.get(name);
    if (!definition || grant.scope_authorized !== true) {
      add('HALT', 'unauthorized_authority', `${name} authority is requested without an explicit authorized scope`);
      continue;
    }

    if (definition.approval === 'human_only') {
      if (humanApprovalStatus === 'rejected') {
        add('HALT', 'human_gate_rejected', `${name} authority was rejected by the human gate`);
      } else if (humanApprovalStatus !== 'approved') {
        add('REVIEW', 'human_gate_required', `${name} authority requires human approval`);
      }
    } else if (definition.approval === 'deterministic_or_human' &&
      !request.gates.deterministic_approval && humanApprovalStatus !== 'approved') {
      add('REVIEW', 'consequential_gate_required', `${name} authority requires deterministic or human approval`);
    }
  }

  const branchWriteRequested = requestedAuthorities.includes('edit') || requestedAuthorities.includes('github_write');
  if (branchWriteRequested && !request.gates.staged_write) {
    add('REVIEW', 'staged_write_required', 'edit and GitHub-write authority must stage changes on a bounded review branch');
  }

  const protectedTargets = (request.targets || []).filter((target) => isProtected(target, policy.protected_paths || []));
  if (branchWriteRequested && protectedTargets.length && humanApprovalStatus !== 'approved') {
    add('REVIEW', 'protected_path_human_gate', `protected paths require human approval: ${protectedTargets.join(', ')}`);
  }

  switch (request.gates.diffwall_evidence) {
    case 'MISSING':
      add('REVIEW', 'missing_diffwall_evidence', 'DiffWall evidence is required before execution or promotion');
      break;
    case 'REVIEW':
      add('REVIEW', 'diffwall_review', 'DiffWall routed the change to REVIEW');
      break;
    case 'HALT':
      add('HALT', 'diffwall_halt', 'DiffWall routed the change to HALT');
      break;
    case 'ALLOW':
      break;
    default:
      add('HALT', 'invalid_diffwall_evidence', 'DiffWall evidence state is invalid');
  }
  if (request.gates.diffwall_evidence !== 'MISSING' && !request.evidence?.diffwall_run_url) {
    add('REVIEW', 'diffwall_reference_missing', 'a non-missing DiffWall result must retain its workflow-run reference');
  }

  if (request.gates.model_override_requested) {
    add('HALT', 'model_override_prohibited', 'model output cannot override deterministic or human gates');
  }
  if (!request.gates.trusted_context_present) {
    add('REVIEW', 'trusted_context_missing', 'required trusted context is missing');
  }
  if (!request.gates.evidence_retained) {
    add('REVIEW', 'evidence_retention_missing', 'execution and decision evidence must be retained');
  }
  if (humanApprovalStatus === 'rejected') {
    add('HALT', 'human_approval_rejected', 'a rejected human gate cannot be bypassed');
  }

  for (const action of workflow.third_party_actions || []) {
    if (FULL_COMMIT_SHA.test(action.ref)) continue;
    if (!matchingPinException(policy, action)) {
      add('REVIEW', 'third_party_action_not_pinned', `${action.uses}@${action.ref} is not pinned to a full commit SHA and has no recorded exception`);
    }
  }

  const computedGate = findings.reduce(
    (gate, finding) => GATE_RANK[finding.gate] > GATE_RANK[gate] ? finding.gate : gate,
    'ALLOW'
  );
  const declaredMatches = request.declared_gate === computedGate;
  return {
    request_id: request.request_id,
    policy_id: policy.policy_id,
    policy_version: policy.version,
    computed_gate: computedGate,
    conformance_verdict: policyErrors.length === 0 && declaredMatches ? 'PASS' : 'FAIL',
    requested_authorities: requestedAuthorities,
    protected_targets: protectedTargets,
    findings,
    checks: {
      policy_valid: policyErrors.length === 0,
      declared_gate_matches: declaredMatches,
      diffwall_halt_preserved: request.gates.diffwall_evidence !== 'HALT' || computedGate === 'HALT'
    }
  };
}

if (require.main === module) {
  const [policyPath, requestPath] = process.argv.slice(2);
  if (!policyPath || !requestPath) {
    console.error('Usage: workflow-execution-trust.js <policy.json> <request.json>');
    process.exit(64);
  }
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  const result = evaluate(policy, request);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.conformance_verdict === 'FAIL' ? 3 : result.computed_gate === 'HALT' ? 2 : result.computed_gate === 'REVIEW' ? 1 : 0);
}

module.exports = { evaluate, validatePolicy, REQUIRED_INPUT_CLASSES, REQUIRED_AUTHORITIES, FULL_COMMIT_SHA };
