'use strict';
const {verifyRetrieval}=require('./governed-rag-provenance.js');
const {evaluate}=require('./governed-rag-preflight.js');
function evaluateVerified(input,registry,now=new Date().toISOString()){
 const provenance=verifyRetrieval(input,registry,now);
 const candidate={...input,verified_digest:provenance.verified};
 const decision=evaluate(candidate,now);
 const reasons=[...decision.reasons];
 if(!provenance.verified){
  for(const code of provenance.reasons)reasons.push({code:`PROVENANCE_${code}`,gate:'HALT'});
 }
 const gate=reasons.some(r=>r.gate==='HALT')?'HALT':reasons.some(r=>r.gate==='REVIEW')?'REVIEW':'ALLOW';
 return {...decision,gate,reasons,provenance:{verified:provenance.verified,reasons:provenance.reasons},external_effects:false};
}
module.exports={evaluateVerified};
