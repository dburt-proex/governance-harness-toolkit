'use strict';
// Offline adversarial tests for the authenticated registry boundary.
// Run: node research/governed-rag-registry-adversarial.test.js
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {canonicalizeRegistryPayload,verifySourceRegistry,isAuthenticatedRegistry}=require('./governed-rag-registry.js');
const keys=crypto.generateKeyPairSync('ed25519');
const now='2026-11-17T12:00:00Z';
const digest=crypto.createHash('sha256').update('Synthetic approved FAQ').digest('hex');
const source={source_id:'approved_faq_v1',enabled:true,version:'v1',permission:'approved',sha256:digest,source_updated_at:'2026-11-16T12:00:00Z'};
const payload={registry_id:'faq-registry',revision:5,issued_at:'2026-11-15T00:00:00Z',expires_at:'2026-12-01T00:00:00Z',sources:{approved_faq_v1:source}};
const sign=(p,key=keys.privateKey)=>({payload:p,signature:{algorithm:'Ed25519',key_id:'test-key',value:crypto.sign(null,Buffer.from(canonicalizeRegistryPayload(p)),key).toString('base64')}});
const options={trustedKeys:{'test-key':keys.publicKey},expectedRegistryId:'faq-registry',minimumRevision:5,now};
const baseline=sign(payload);
const cases=[
 ['baseline',baseline,options,true],
 ['modified payload after signing',{...baseline,payload:{...payload,revision:6}},options,false],
 ['old revision',sign({...payload,revision:4}),options,false],
 ['expired registry',sign({...payload,expires_at:'2026-11-16T00:00:00Z'}),options,false],
 ['future registry',sign({...payload,issued_at:'2026-11-18T00:00:00Z'}),options,false],
 ['wrong registry identity',baseline,{...options,expectedRegistryId:'other'},false],
 ['wrong signing key',baseline,{...options,trustedKeys:{'test-key':crypto.generateKeyPairSync('ed25519').publicKey}},false],
 ['unknown key id',{...baseline,signature:{...baseline.signature,key_id:'unknown'}},options,false],
 ['bad algorithm',{...baseline,signature:{...baseline.signature,algorithm:'none'}},options,false],
 ['untrusted caller verified flag',{...baseline,verified:true},options,false],
 ['disabled source',sign({...payload,sources:{approved_faq_v1:{...source,enabled:false}}}),options,true],
 ['source permission denied',sign({...payload,sources:{approved_faq_v1:{...source,permission:'denied'}}}),options,true],
 ['source digest changed without resigning',{...baseline,payload:{...payload,sources:{approved_faq_v1:{...source,sha256:'b'.repeat(64)}}}},options,false],
 ['missing trust anchors',baseline,{...options,trustedKeys:null},false],
 ['invalid clock',baseline,{...options,now:'not-a-date'},false]
];
for(const [name,envelope,opts,expected] of cases){
 const result=verifySourceRegistry(envelope,opts);
 assert.equal(result.verified,expected,name);
 assert.equal(isAuthenticatedRegistry(result),expected,name);
 if(!expected)assert.ok(result.reasons.length,name);
}
const authentic=verifySourceRegistry(baseline,options);
assert.ok(Object.isFrozen(authentic.payload));
assert.ok(Object.isFrozen(authentic.payload.sources.approved_faq_v1));
assert.equal(authentic.payload.sources.approved_faq_v1.sha256,digest);
assert.equal(isAuthenticatedRegistry({...authentic}),false,'cloned verification objects must not gain trust');
console.log('15 adversarial registry fixtures + immutable/authentication assertions passed');
