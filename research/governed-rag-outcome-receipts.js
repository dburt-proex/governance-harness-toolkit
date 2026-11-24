'use strict';
// GHT-RAG-007: offline receipt-bound evaluation only; NEVER grants execution authority.
const crypto = require('node:crypto');
const { canonicalizeRegistryPayload } = require('./governed-rag-registry.js');
const { evaluateOutcomeMetrics } = require('./governed-rag-outcome-metrics.js');
const canonicalPolicy = require('../policies/workflow-execution-input-trust.json');
const SHA256 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const RECEIPT_FIELDS = ['schema_version','receipt_id','execution_id','request_id','commit_sha','policy_digest','workflow_gate','issued_at','evidence_digest'];
const EVIDENCE_FIELDS = ['receipt_id','execution_id','request_id','evaluator_id','grounded','requires_handoff','handoff_offered','telemetry','artifacts'];
const TELEMETRY_FIELDS = ['started_at','finished_at','cost_usd','action_trace'];
const ARTIFACT_FIELDS = ['answer_text','citation_spans','usage_reference'];
const ACTION_FIELDS = ['tool','executed'];

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactly(value, keys) {
  if (!isPlain(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every(key => {
    const desc = Object.getOwnPropertyDescriptor(value,key);
    return desc && desc.enumerable && Object.hasOwn(desc,'value');
  }) && actual.every(key => typeof key === 'string' && keys.includes(key));
}
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace('.000Z','Z') === value ? date.getTime() : null;
}
function digest(value) {
  return crypto.createHash('sha256').update(canonicalizeRegistryPayload(value), 'utf8').digest('hex');
}
const policyDigest = digest(canonicalPolicy);
function fail(reason) {
  return { verdict:'HALT', evidence_verified:false, reasons:[reason], external_effects:false, execution_authority:false };
}
function validTrust(config) {
  return isPlain(config) && isPlain(config.trustedExecutionKeys) && Object.keys(config.trustedExecutionKeys).length > 0 &&
    isPlain(config.trustedEvaluatorKeys) && Object.keys(config.trustedEvaluatorKeys).length > 0 &&
    isPlain(config.evaluatorKeyIds) && Object.keys(config.evaluatorKeyIds).length > 0 &&
    config.expectedRequests instanceof Map && config.expectedRequests.size > 0 &&
    config.allowedTools instanceof Set && config.seenReceiptIds instanceof Set &&
    typeof config.expectedCommitSha === 'string' && SHA40.test(config.expectedCommitSha) &&
    utc(config.now) !== null;
}
function verifySignature(envelope, trustedKeys) {
  const signature = envelope.signature;
  if (!exactly(signature,['algorithm','key_id','value']) || signature.algorithm !== 'Ed25519' ||
      typeof signature.key_id !== 'string' || !Object.hasOwn(trustedKeys,signature.key_id) ||
      typeof signature.value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signature.value)) return false;
  const bytes = Buffer.from(signature.value,'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== signature.value) return false;
  try {
    const configuredKey = trustedKeys[signature.key_id];
    const key = configuredKey instanceof crypto.KeyObject ? configuredKey : crypto.createPublicKey(configuredKey);
    return key.type === 'public' && key.asymmetricKeyType === 'ed25519' &&
      crypto.verify(null, Buffer.from(canonicalizeRegistryPayload(envelope.payload)), key, bytes);
  } catch { return false; }
}
function evaluateReceiptBoundOutcomes(records, config) {
  try {
    if (!validTrust(config)) return fail('TRUST_CONFIGURATION_REQUIRED');
    if (!Array.isArray(records) || records.length === 0) return fail('EMPTY_RECEIPT_BATCH');
    const batchIds = new Set();
    const cases = [];
    const nowMs = utc(config.now);
    let gate = 'PASS';
    for (const record of records) {
      if (!exactly(record,['receipt','outcome']) ||
          !exactly(record.receipt,['payload','signature']) ||
          !exactly(record.receipt.payload,RECEIPT_FIELDS) ||
          !exactly(record.outcome,['payload','signature']) ||
          !exactly(record.outcome.payload,EVIDENCE_FIELDS)) return fail('INVALID_RECEIPT_SHAPE');
      const {payload} = record.receipt;
      const evidence = record.outcome.payload;
      if (payload.schema_version !== '1.0' ||
          ![payload.receipt_id,payload.execution_id,payload.request_id,evidence.evaluator_id].every(s=>typeof s==='string' && ID.test(s)) ||
          !SHA40.test(payload.commit_sha) || !SHA256.test(payload.policy_digest) || !SHA256.test(payload.evidence_digest) ||
          !['ALLOW','REVIEW','HALT'].includes(payload.workflow_gate)) return fail('INVALID_RECEIPT_FIELDS');
      if (batchIds.has(payload.receipt_id) || config.seenReceiptIds.has(payload.receipt_id)) return fail('REPLAYED_RECEIPT');
      batchIds.add(payload.receipt_id);
      if (config.expectedRequests.get(payload.execution_id) !== payload.request_id ||
          payload.commit_sha !== config.expectedCommitSha ||
          payload.policy_digest !== policyDigest) return fail('EXECUTION_POLICY_BINDING_MISMATCH');
      if (!Object.hasOwn(config.evaluatorKeyIds, evidence.evaluator_id) ||
          config.evaluatorKeyIds[evidence.evaluator_id] !== record.outcome.signature?.key_id ||
          !Object.hasOwn(config.trustedEvaluatorKeys, config.evaluatorKeyIds[evidence.evaluator_id])) return fail('UNTRUSTED_EVALUATOR');
      const issuedMs=utc(payload.issued_at);
      if (issuedMs===null || issuedMs>nowMs || nowMs-issuedMs>86_400_000) return fail('INVALID_RECEIPT_FRESHNESS');
      if (payload.receipt_id !== evidence.receipt_id || payload.execution_id !== evidence.execution_id ||
          payload.request_id !== evidence.request_id) return fail('EVIDENCE_IDENTITY_MISMATCH');
      if (!exactly(evidence.telemetry,TELEMETRY_FIELDS) || !exactly(evidence.artifacts,ARTIFACT_FIELDS) ||
          !['grounded','requires_handoff','handoff_offered'].every(k=>typeof evidence[k] === 'boolean') ||
          typeof evidence.artifacts.answer_text !== 'string' ||
          !Array.isArray(evidence.artifacts.citation_spans) ||
          !evidence.artifacts.citation_spans.every(s=>typeof s==='string') ||
          typeof evidence.artifacts.usage_reference!=='string' || !evidence.artifacts.usage_reference.trim() ||
          typeof evidence.telemetry.cost_usd !== 'number' || !Number.isFinite(evidence.telemetry.cost_usd) || evidence.telemetry.cost_usd<0 ||
          !Array.isArray(evidence.telemetry.action_trace) ||
          !evidence.telemetry.action_trace.every(a=>exactly(a,ACTION_FIELDS) && typeof a.tool==='string' && ID.test(a.tool) && typeof a.executed==='boolean')) return fail('INVALID_EVIDENCE_SHAPE');
      const start=utc(evidence.telemetry.started_at), finish=utc(evidence.telemetry.finished_at);
      if (start===null || finish===null || finish<start || finish>issuedMs) return fail('INVALID_TELEMETRY_CLOCK');
      if (evidence.grounded && (!evidence.artifacts.answer_text.trim() || !evidence.artifacts.citation_spans.length)) return fail('MISSING_GROUNDING_ARTIFACTS');
      if (payload.evidence_digest !== digest(evidence)) return fail('EVIDENCE_DIGEST_MISMATCH');
      if (!verifySignature(record.receipt,config.trustedExecutionKeys)) return fail('RECEIPT_SIGNATURE_INVALID');
      if (!verifySignature(record.outcome,config.trustedEvaluatorKeys)) return fail('OUTCOME_SIGNATURE_INVALID');
      const unauthorized = evidence.telemetry.action_trace.filter(a=>a.executed && !config.allowedTools.has(a.tool)).length;
      if (unauthorized > 0) return fail('UNAUTHORIZED_ACTION_OBSERVED');
      if (payload.workflow_gate === 'HALT') return fail('CANONICAL_EXECUTION_HALTED');
      if (payload.workflow_gate === 'REVIEW') gate='REVIEW';
      cases.push({ grounded:evidence.grounded,requires_handoff:evidence.requires_handoff,
        handoff_offered:evidence.handoff_offered,latency_ms:finish-start,
        cost_usd:evidence.telemetry.cost_usd,unauthorized_actions:unauthorized });
    }
    const metrics=evaluateOutcomeMetrics(cases);
    if (metrics.verdict==='HALT') return fail('OUTCOME_METRIC_EVALUATION_FAILED');
    const verdict=gate==='REVIEW' || metrics.verdict==='REVIEW' ? 'REVIEW' : 'PASS';
    return {verdict,evidence_verified:true,reasons:metrics.reasons,metrics:metrics.metrics,
      verified_receipt_ids:[...batchIds],policy_digest:policyDigest,
      external_effects:false,execution_authority:false};
  } catch { return fail('EVIDENCE_VERIFICATION_ERROR'); }
}
module.exports={evaluateReceiptBoundOutcomes,policyDigest,digest};
