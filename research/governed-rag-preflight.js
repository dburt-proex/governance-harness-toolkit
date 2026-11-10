"use strict";
const ALLOWED=new Set(["source_id","source_digest","source_version","retrieved_at","source_updated_at","license_or_permission","retrieval_score","snippet","request_id","requested_tool","citation","answer","action","owner_approved","verified_digest"]);
const REQUIRED=["source_id","source_digest","source_version","retrieved_at","source_updated_at","license_or_permission","retrieval_score","snippet","request_id","requested_tool"];
function evaluate(input,now="2026-11-10T12:00:00Z"){
 const reasons=[];const add=(code,gate)=>reasons.push({code,gate});
 if(!input||typeof input!=="object"||Array.isArray(input))return {gate:"HALT",reasons:[{code:"INVALID_INPUT",gate:"HALT"}]};
 if(Object.keys(input).some(k=>!ALLOWED.has(k)))add("UNKNOWN_FIELD","HALT");
 if(REQUIRED.some(k=>!(k in input)))add("MISSING_REQUIRED_FIELD","HALT");
 if(input.source_id!=="approved_faq_v1"||!/^[a-f0-9]{64}$/.test(input.source_digest||"")||input.verified_digest!==true)add("UNVERIFIED_PROVENANCE","HALT");
 if(input.license_or_permission!=="approved")add("DATA_RIGHTS","HALT");
 if(input.requested_tool!=="retrieve_approved_faq")add("TOOL_SCOPE","HALT");
 if(typeof input.snippet!=="string")add("INVALID_CONTEXT","HALT");
 else{
 if(/ignore (all |the )?(previous|prior) instructions|reveal (the )?(system prompt|secrets)|grant (me |new )?(github write|github|write|admin) (access|authority|permission)/i.test(input.snippet))add("INSTRUCTION_PROMOTION","HALT");
 if(!input.snippet.trim()||input.snippet.length>6000)add("CONTEXT_QUALITY","REVIEW");
 }
 const age=(Date.parse(now)-Date.parse(input.source_updated_at))/86400000;
 if(!Number.isFinite(age)||age<0)add("INVALID_FRESHNESS","HALT");else if(age>90)add("STALE_SOURCE","REVIEW");
 if(typeof input.retrieval_score!=="number"||!Number.isFinite(input.retrieval_score)||input.retrieval_score<0||input.retrieval_score>1)add("INVALID_SCORE","HALT");
 else if(input.retrieval_score<0.75)add("LOW_RELEVANCE","REVIEW");
 if(!input.citation&&input.answer)add("UNGROUNDED_ANSWER","REVIEW");
 if(input.action&&input.action!=="draft")add("CONSEQUENTIAL_ACTION","REVIEW");
 const gate=reasons.some(r=>r.gate==="HALT")?"HALT":reasons.length?"REVIEW":"ALLOW";
 return {gate,reasons,scope:"draft_only",request_id:input.request_id||null,policy_id:"POL-WORKFLOW-EXECUTION-INPUT-TRUST-1",external_effects:false};
}
module.exports={evaluate};
