'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {evaluateReceiptBoundOutcomes:evaluate,policyDigest,digest}=require('./governed-rag-outcome-receipts.js');
const {canonicalizeRegistryPayload}=require('./governed-rag-registry.js');
const runtime=crypto.generateKeyPairSync('ed25519');
const evaluator=crypto.generateKeyPairSync('ed25519');
const attacker=crypto.generateKeyPairSync('ed25519');
const COMMIT='a'.repeat(40);
const now='2026-11-24T12:00:00Z';
const trust=()=>({expectedCommitSha:COMMIT,
  expectedRequests:new Map([['exec-001','request-001'],['exec-002','request-002']]),
  evaluatorKeyIds:{'eval-001':'evaluator-key'},allowedTools:new Set(['retrieve_approved_faq']),
  seenReceiptIds:new Set(),trustedExecutionKeys:{'runtime-key':runtime.publicKey},
  trustedEvaluatorKeys:{'evaluator-key':evaluator.publicKey},now});
const evidence=()=>({
  receipt_id:'receipt-001',execution_id:'exec-001',request_id:'request-001',evaluator_id:'eval-001',
  grounded:true,requires_handoff:true,handoff_offered:true,
  telemetry:{started_at:'2026-11-24T11:59:00Z',finished_at:'2026-11-24T11:59:01Z',cost_usd:0.004,
    action_trace:[{tool:'retrieve_approved_faq',executed:true}]},
  artifacts:{answer_text:'Hours are 9am–6pm',citation_spans:['faq#hours'],usage_reference:'synthetic-usage-001'}
});
function sig(payload,key,keyId){return {algorithm:'Ed25519',key_id:keyId,
  value:crypto.sign(null,Buffer.from(canonicalizeRegistryPayload(payload)),key).toString('base64')};}
function signed(ev=evidence(),patch={},runtimeKey=runtime.privateKey,evaluatorKey=evaluator.privateKey){
 const payload={schema_version:'1.0',receipt_id:ev.receipt_id,execution_id:ev.execution_id,
  request_id:ev.request_id,commit_sha:COMMIT,policy_digest:policyDigest,
  workflow_gate:'ALLOW',issued_at:'2026-11-24T11:59:02Z',evidence_digest:digest(ev),...patch};
 return {receipt:{payload,signature:sig(payload,runtimeKey,'runtime-key')},
   outcome:{payload:ev,signature:sig(ev,evaluatorKey,'evaluator-key')}};
}
function mutateSignedEvidence(fn){return x=>signed(fn(x.outcome.payload));}
function tamperEvidence(fn){return x=>({...x,outcome:{...x.outcome,payload:fn(x.outcome.payload)}});}
const cases=[
 ['valid independently signed receipt and evidence',x=>x,'PASS',null],
 ['tampered grounded label',tamperEvidence(ev=>({...ev,grounded:false})),'HALT','EVIDENCE_DIGEST_MISMATCH'],
 ['tampered latency',tamperEvidence(ev=>({...ev,telemetry:{...ev.telemetry,started_at:'2026-11-24T11:58:59Z'}})),'HALT','EVIDENCE_DIGEST_MISMATCH'],
 ['tampered cost',tamperEvidence(ev=>({...ev,telemetry:{...ev.telemetry,cost_usd:0.0001}})),'HALT','EVIDENCE_DIGEST_MISMATCH'],
 ['forged verified flag',x=>({...x,verified:true}),'HALT','INVALID_RECEIPT_SHAPE'],
 ['forged runtime signature',x=>signed(x.outcome.payload,{},attacker.privateKey),'HALT','RECEIPT_SIGNATURE_INVALID'],
 ['forged evaluator signature',x=>signed(x.outcome.payload,{},runtime.privateKey,attacker.privateKey),'HALT','OUTCOME_SIGNATURE_INVALID'],
 ['unknown runtime key',x=>({...x,receipt:{...x.receipt,signature:{...x.receipt.signature,key_id:'attacker'}}}),'HALT','RECEIPT_SIGNATURE_INVALID'],
 ['unknown execution',mutateSignedEvidence(ev=>({...ev,execution_id:'exec-999'})),'HALT','EXECUTION_POLICY_BINDING_MISMATCH'],
 ['forged request binding',mutateSignedEvidence(ev=>({...ev,request_id:'request-999'})),'HALT','EXECUTION_POLICY_BINDING_MISMATCH'],
 ['unknown evaluator',mutateSignedEvidence(ev=>({...ev,evaluator_id:'untrusted'})),'HALT','UNTRUSTED_EVALUATOR'],
 ['wrong evaluator key identity',x=>({...x,outcome:{...x.outcome,signature:{...x.outcome.signature,key_id:'other-evaluator'}}}),'HALT','UNTRUSTED_EVALUATOR'],
 ['policy digest mismatch',x=>signed(x.outcome.payload,{policy_digest:'b'.repeat(64)}),'HALT','EXECUTION_POLICY_BINDING_MISMATCH'],
 ['commit SHA mismatch',x=>signed(x.outcome.payload,{commit_sha:'b'.repeat(40)}),'HALT','EXECUTION_POLICY_BINDING_MISMATCH'],
 ['expired receipt',x=>signed(x.outcome.payload,{issued_at:'2026-11-22T11:59:02Z'}),'HALT','INVALID_RECEIPT_FRESHNESS'],
 ['future issued',x=>signed(x.outcome.payload,{issued_at:'2026-11-25T11:59:02Z'}),'HALT','INVALID_RECEIPT_FRESHNESS'],
 ['invalid calendar date',x=>signed(x.outcome.payload,{issued_at:'2026-02-30T11:59:02Z'}),'HALT','INVALID_RECEIPT_FRESHNESS'],
 ['missing signed citation',mutateSignedEvidence(ev=>({...ev,artifacts:{...ev.artifacts,citation_spans:[]}})),'HALT','MISSING_GROUNDING_ARTIFACTS'],
 ['signed unauthorized external tool',mutateSignedEvidence(ev=>({...ev,telemetry:{...ev.telemetry,action_trace:[{tool:'send_email',executed:true}]}})),'HALT','UNAUTHORIZED_ACTION_OBSERVED'],
 ['signed nonexecuted tool',mutateSignedEvidence(ev=>({...ev,telemetry:{...ev.telemetry,action_trace:[{tool:'send_email',executed:false}]}})),'PASS',null],
 ['canonical HALT gate',x=>signed(x.outcome.payload,{workflow_gate:'HALT'}),'HALT','CANONICAL_EXECUTION_HALTED'],
 ['canonical REVIEW gate',x=>signed(x.outcome.payload,{workflow_gate:'REVIEW'}),'REVIEW',null],
 ['signed ungrounded',mutateSignedEvidence(ev=>({...ev,grounded:false})),'REVIEW','GROUNDING_BELOW_TARGET'],
 ['signed missed handoff',mutateSignedEvidence(ev=>({...ev,handoff_offered:false})),'REVIEW','HANDOFF_RECALL_BELOW_TARGET'],
 ['signed high cost',mutateSignedEvidence(ev=>({...ev,telemetry:{...ev.telemetry,cost_usd:0.045}})),'REVIEW','COST_OVER_TARGET'],
 ['signed high latency',mutateSignedEvidence(ev=>({...ev,telemetry:{...ev.telemetry,started_at:'2026-11-24T11:58:00Z'}})),'REVIEW','LATENCY_OVER_TARGET'],
 ['receipt/evidence mismatch',x=>signed({...x.outcome.payload,request_id:'request-003'},{request_id:'request-001'}),'HALT','EVIDENCE_IDENTITY_MISMATCH'],
 ['telemetry clock inversion',mutateSignedEvidence(ev=>({...ev,telemetry:{...ev.telemetry,started_at:'2026-11-24T12:00:00Z'}})),'HALT','INVALID_TELEMETRY_CLOCK'],
 ['unknown evidence attribute',mutateSignedEvidence(ev=>({...ev,scope_authorized:true})),'HALT','INVALID_RECEIPT_SHAPE'],
 ['malformed action trace',mutateSignedEvidence(ev=>({...ev,telemetry:{...ev.telemetry,action_trace:[{tool:'send_email',executed:'yes'}]}})),'HALT','INVALID_EVIDENCE_SHAPE'],
 ['no citations with grounding',mutateSignedEvidence(ev=>({...ev,artifacts:{...ev.artifacts,citation_spans:[]}})),'HALT','MISSING_GROUNDING_ARTIFACTS']
];
for(const [name,transform,expected,reason] of cases){
 const result=evaluate([transform(signed())],trust());
 assert.equal(result.verdict,expected,name+': '+JSON.stringify(result));
 if(reason)assert.ok(result.reasons.includes(reason),name+': '+JSON.stringify(result));
 assert.equal(result.execution_authority,false,name);
 assert.equal(result.external_effects,false,name);
}
const extra=[
 ['empty',evaluate([],trust()).reasons[0],'EMPTY_RECEIPT_BATCH'],
 ['no execution trust anchor',evaluate([signed()],{...trust(),trustedExecutionKeys:null}).reasons[0],'TRUST_CONFIGURATION_REQUIRED'],
 ['no evaluator trust anchor',evaluate([signed()],{...trust(),trustedEvaluatorKeys:null}).reasons[0],'TRUST_CONFIGURATION_REQUIRED'],
 ['duplicate within batch',evaluate([signed(),signed()],trust()).reasons[0],'REPLAYED_RECEIPT'],
 ['duplicate in ledger',(()=>{const t=trust();t.seenReceiptIds.add('receipt-001');return evaluate([signed()],t).reasons[0]})(),'REPLAYED_RECEIPT']
];
for(const [name,got,want] of extra)assert.equal(got,want,name);
const second=evidence(); second.receipt_id='receipt-002';second.execution_id='exec-002';second.request_id='request-002';
const batch=evaluate([signed(),signed(second)],trust());assert.equal(batch.verdict,'PASS');assert.equal(batch.metrics.samples,2);
const clean=evaluate([signed()],trust());assert.ok(clean.evidence_verified);assert.equal(clean.metrics.p95LatencyMs,1000);
console.log(String(cases.length+extra.length+2)+' receipt-bound outcome assertions passed');
