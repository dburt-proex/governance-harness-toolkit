"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyRetrieval}=require("./governed-rag-provenance.js");
const snippet="Hours are 9am to 6pm.";
const digest=crypto.createHash("sha256").update(snippet).digest("hex");
const registry=Object.freeze({approved_faq_v1:{enabled:true,version:"v1",permission:"approved",sha256:digest}});
const base={source_id:"approved_faq_v1",source_digest:digest,source_version:"v1",license_or_permission:"approved",snippet,source_updated_at:"2026-11-09T10:00:00Z",retrieved_at:"2026-11-10T11:00:00Z"};
const now="2026-11-10T12:00:00Z";
const cases=[
["valid",{},registry,true],
["changed content",{snippet:snippet+" malicious"},registry,false],
["forged digest",{source_digest:"a".repeat(64)},registry,false],
["unknown source",{source_id:"unknown"},registry,false],
["wrong version",{source_version:"v2"},registry,false],
["disallowed rights",{license_or_permission:"unlicensed"},registry,false],
["missing digest",{source_digest:""},registry,false],
["future retrieval",{retrieved_at:"2026-11-11T00:00:00Z"},registry,false],
["time inversion",{source_updated_at:"2026-11-10T11:30:00Z"},registry,false],
["disabled source",{}, {approved_faq_v1:{...registry.approved_faq_v1,enabled:false}},false],
["registry tampering",{}, {approved_faq_v1:{...registry.approved_faq_v1,sha256:"b".repeat(64)}},false],
["empty context",{snippet:""},registry,false],
["missing registry",{},null,false],
["invalid updated time",{source_updated_at:"bad"},registry,false],
["unknown source property",{source_id:"toString"},registry,false]
];
for(const [id,patch,reg,expected] of cases){
 const actual=verifyRetrieval({...base,...patch},reg,now);
 assert.equal(actual.verified,expected,id);
 if(!expected)assert.ok(actual.reasons.length,id);
}
console.log(cases.length+" provenance fixtures passed");
