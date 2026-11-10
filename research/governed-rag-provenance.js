"use strict";
const crypto=require("node:crypto");
const HEX=/^[a-f0-9]{64}$/;
function verifyRetrieval(record, registry, now=new Date()){
 const reasons=[];
 const fail=(code)=>reasons.push(code);
 if(!record||typeof record!=="object"||Array.isArray(record))return {verified:false,reasons:["INVALID_RECORD"]};
 if(!registry||typeof registry!=="object"||Array.isArray(registry))return {verified:false,reasons:["INVALID_REGISTRY"]};
 const entry=Object.hasOwn(registry,record.source_id)?registry[record.source_id]:null;
 if(!entry||entry.enabled!==true)fail("SOURCE_NOT_REGISTERED");
 if(typeof record.snippet!=="string"||!record.snippet.trim())fail("INVALID_SNIPPET");
 if(typeof record.source_digest!=="string"||!HEX.test(record.source_digest))fail("INVALID_DIGEST_FORMAT");
 if(typeof record.snippet==="string"&&HEX.test(record.source_digest||"")){
  const computed=crypto.createHash("sha256").update(record.snippet,"utf8").digest("hex");
  if(!crypto.timingSafeEqual(Buffer.from(computed,"hex"),Buffer.from(record.source_digest,"hex")))fail("DIGEST_MISMATCH");
 }
 if(entry){
  if(record.source_version!==entry.version)fail("SOURCE_VERSION_MISMATCH");
  if(record.license_or_permission!==entry.permission||entry.permission!=="approved")fail("SOURCE_RIGHTS");
  if(typeof entry.sha256!=="string"||!HEX.test(entry.sha256)||record.source_digest!==entry.sha256)fail("REGISTRY_DIGEST_MISMATCH");
 }
 const updated=Date.parse(record.source_updated_at), retrieved=Date.parse(record.retrieved_at), current=new Date(now).getTime();
 if(!Number.isFinite(current)||!Number.isFinite(updated)||!Number.isFinite(retrieved)||updated>retrieved||retrieved>current)fail("INVALID_TIMESTAMPS");
 return {verified:reasons.length===0,reasons};
}
module.exports={verifyRetrieval};
