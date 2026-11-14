'use strict';
const fs=require('fs');
const crypto=require('crypto');
const {check}=require('../lib/check');
const {verify,digest}=require('../lib/evidence');
function review(bytes,manifest,root,{trustStore=null,asOf=new Date().toISOString()}={}) {
 if(!Number.isFinite(Date.parse(asOf)))throw Error('Invalid review time');
 const record=JSON.parse(bytes.toString('utf8'));
 const checked=check('decision',record);
 const evidence=verify(manifest,root,bytes,trustStore,asOf);
 const reasons=[];
 if(record?.approval?.required && (!evidence.approval_verified || manifest?.approval?.approver!==record.approval.approver))reasons.push('Required approval is not verified for the recorded approver');
 for(const ref of Array.isArray(record?.evidence)?record.evidence:[])if(!Array.isArray(manifest?.files)||!manifest.files.some(f=>f?.source_id===ref?.source_id))reasons.push('Evidence source ID is unresolved: '+ref?.source_id);
 const rank={ALLOW:0,REVIEW:1,HALT:2};
 const decision=[checked.decision,evidence.computed_gate,reasons.length?'REVIEW':'ALLOW'].reduce((a,b)=>rank[b]>rank[a]?b:a,'ALLOW');
 evidence.reviews.push(...reasons);
 return {packet_id:'PKT-'+crypto.randomUUID(),purpose:typeof record?.decision?.statement==='string'&&record.decision.statement?record.decision.statement:'Evaluate a supplied decision record',subject_sha256:digest(bytes),decision,business_outcome:'UNKNOWN',events:[{at:asOf,type:'review_requested',detail:'Evaluate the supplied record; no historical execution is inferred.'},{at:asOf,type:'review_completed',detail:'Record '+checked.record_status+'; combined decision '+decision+'. No business action executed.'}],evidence,check:checked,next_action:decision==='ALLOW'?'Review the retained packet and any remaining execution controls. This is not execution authority.':'Resolve the reported input, evidence or approval gaps and rerun.'};
}
function write(recordPath,manifestPath,root,output,options={}){
 const packet=review(fs.readFileSync(recordPath),JSON.parse(fs.readFileSync(manifestPath,'utf8')),root,options);
 fs.writeFileSync(output,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});return packet;
}
function run(json){
 const recordPath='examples/decision-record/approved-source-registry.json';
 const bytes=fs.readFileSync(recordPath);
 const packet=review(bytes,{subject_sha256:digest(bytes),files:[]},process.cwd(),{asOf:'2026-11-14T00:00:00Z'});
 if(json)console.log(JSON.stringify(packet,null,2));else console.log('Demo decision: '+packet.decision+'\nThe example lacks independently verified source files and approval. No business action was executed.');
 return packet.decision==='HALT'?2:packet.decision==='REVIEW'?1:0;
}
module.exports={review,write,run};
