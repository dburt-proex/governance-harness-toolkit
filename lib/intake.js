'use strict';
const fs=require('fs');
const readline=require('readline/promises');
const crypto=require('crypto');
const {errors}=require('./validation');
function create({name,objective,success}) {
 return {intake_id:'INT-'+crypto.randomUUID().toUpperCase(),submitted_at:new Date().toISOString(),requester:{name,authority:'contributor'},objective,domain:'toolkit_governance',priority:'normal',risk_level:'low',requested_outputs:[{artifact_type:'research_brief',format:'markdown',acceptance_criteria:[success]}],success_criteria:[success],failure_conditions:['Required evidence or authority cannot be established'],source_policy:{allowed_classes:['primary','secondary'],citation_required:true,freshness_required:true},action_policy:{external_writes:'prohibited',approval_gate:'none',sensitive_data:'none',allowed_actions:['read_public_sources']},routing:{workflow:'research_brief',required_skills:['research-brief','source-triage','evaluate-output'],decision_state:'REVIEW',rationale:'Draft intake requires classification and authority review before use.'},lifecycle_status:'submitted'};
}
async function run(output){
 if(!output)throw Error('Specify a new output JSON filename');
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 let value;try{value=create({name:await rl.question('Your name: '),objective:await rl.question('What should this work accomplish? (10+ characters): '),success:await rl.question('What observable result means success? ')});}finally{rl.close();}
 const failures=errors('intake-record',value);if(failures.length)throw Error(failures.join('; '));
 fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log('Draft saved: '+output+'\nAuthority is unverified. Next: review the classification, risk and permissions, then check route.');return 0;
}
module.exports={create,run};
