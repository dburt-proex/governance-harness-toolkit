'use strict';

const { verifySourceRegistry } = require('./governed-rag-registry.js');
const { verifyRetrieval } = require('./governed-rag-provenance.js');
const { evaluate: evaluatePreflight } = require('./governed-rag-preflight.js');
const { evaluate: evaluateWorkflowExecutionTrust } =
  require('../evaluators/workflow-execution-trust.js');
const defaultWorkflowPolicy = require('../policies/workflow-execution-input-trust.json');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const workflowRequestSchema = require('../schemas/workflow-execution-trust.schema.json');

const requestValidator = createWorkflowRequestValidator();

const GATE_RANK = { ALLOW: 0, REVIEW: 1, HALT: 2 };

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function strongerGate(left, right) {
  return GATE_RANK[right] > GATE_RANK[left] ? right : left;
}

function canonicalFailure(code, detail) {
  return {
    evaluated: false,
    policy_id: defaultWorkflowPolicy.policy_id,
    computed_gate: 'HALT',
    conformance_verdict: 'FAIL',
    requested_authorities: [],
    findings: [{ gate: 'HALT', code, detail }]
  };
}

function createWorkflowRequestValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv.compile(workflowRequestSchema);
}

function evaluateVerifiedInternal(input, registryEnvelope, options = {}) {
  const config = isRecord(options) ? options : {};
  const now = config.now === undefined ? new Date() : config.now;
  const registry = verifySourceRegistry(registryEnvelope, {
    trustedKeys: config.trustedKeys,
    expectedRegistryId: config.expectedRegistryId,
    minimumRevision: config.minimumRevision,
    now
  });
  const provenance = verifyRetrieval(input, registry, now);
  const candidate = isRecord(input) ? { ...input, verified_digest: provenance.verified } : input;
  const trustedSourceIds = registry.verified
    ? Object.entries(registry.payload.sources)
      .filter(([, source]) => source.enabled === true && source.permission === 'approved')
      .map(([sourceId]) => sourceId)
    : [];
  const ragDecision = evaluatePreflight(candidate, now, trustedSourceIds);

  let workflowDecision;
  const executionRequest = config.executionRequest;
  if (!isRecord(executionRequest) || !Array.isArray(executionRequest.inputs) ||
      !isRecord(executionRequest.authority) || !isRecord(executionRequest.workflow) ||
      !isRecord(executionRequest.gates) || !isRecord(executionRequest.gates.human_approval)) {
    workflowDecision = canonicalFailure(
      'canonical_request_required',
      'A complete canonical GHT workflow request is required.'
    );
  } else {
    const request = {
      ...executionRequest,
      inputs: [
        ...executionRequest.inputs,
        {
          class: 'external_web_content',
          treated_as_authoritative_instruction: false,
          verified: provenance.verified
        }
      ],
      gates: {
        ...executionRequest.gates,
        trusted_context_present:
          executionRequest.gates.trusted_context_present === true && ragDecision.gate === 'ALLOW'
      }
    };
    try {
      if (!requestValidator(request)) {
        workflowDecision = canonicalFailure(
          'canonical_request_schema_invalid',
          'The GHT workflow request failed the canonical schema.'
        );
      } else {
        const policy = config.workflowPolicy || defaultWorkflowPolicy;
        workflowDecision = {
          evaluated: true,
          ...evaluateWorkflowExecutionTrust(policy, request)
        };
      }
    } catch {
      workflowDecision = canonicalFailure(
        'canonical_evaluator_error',
        'The canonical GHT workflow evaluator could not evaluate this request.'
      );
    }
  }

  let gate = strongerGate(ragDecision.gate, workflowDecision.computed_gate);
  if (workflowDecision.conformance_verdict !== 'PASS') gate = 'HALT';

  const reasons = [...ragDecision.reasons];
  for (const finding of workflowDecision.findings || []) {
    reasons.push({
      code: 'GHT_' + finding.code,
      gate: finding.gate,
      detail: finding.detail
    });
  }

  return {
    ...ragDecision,
    gate,
    reasons,
    policy_id: workflowDecision.policy_id || ragDecision.policy_id,
    source_registry: {
      verified: registry.verified,
      registry_id: registry.registry_id,
      revision: registry.revision,
      key_id: registry.key_id,
      reasons: registry.reasons
    },
    provenance,
    workflow_execution: {
      evaluated: workflowDecision.evaluated === true,
      policy_id: workflowDecision.policy_id,
      computed_gate: workflowDecision.computed_gate,
      conformance_verdict: workflowDecision.conformance_verdict,
      requested_authorities: workflowDecision.requested_authorities || [],
      findings: workflowDecision.findings || []
    },
    external_effects: false
  };
}

function evaluateVerified(input, registryEnvelope, options = {}) {
  try {
    return evaluateVerifiedInternal(input, registryEnvelope, options);
  } catch {
    return {
      gate: 'HALT',
      reasons: [{ code: 'INVALID_EVALUATION_INPUT', gate: 'HALT' }],
      policy_id: defaultWorkflowPolicy.policy_id,
      source_registry: {
        verified: false,
        registry_id: null,
        revision: null,
        key_id: null,
        reasons: ['INVALID_EVALUATION_INPUT']
      },
      provenance: { verified: false, reasons: ['INVALID_EVALUATION_INPUT'] },
      workflow_execution: {
        evaluated: false,
        policy_id: defaultWorkflowPolicy.policy_id,
        computed_gate: 'HALT',
        conformance_verdict: 'FAIL',
        requested_authorities: [],
        findings: []
      },
      external_effects: false
    };
  }
}

module.exports = { evaluateVerified };
