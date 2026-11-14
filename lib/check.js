'use strict';
const fs = require('fs');
const path = require('path');
const {errors} = require('./validation');
const TYPES = {
 'reconcile': ['../evaluators/post-merge-reconciliation','evaluate','reconciliation'],
 'action': ['../evaluators/action-permission','evaluate','action-request'],
 'build': ['../evaluators/build-run','evaluate','build-run'],
 'decision': ['../evaluators/decision-record','evaluateDecision','decision-record'],
 'learning': ['../evaluators/learning-review','evaluate','learning-review'],
 'output': ['../evaluators/output-evaluation','evaluateOutput','output-evaluation'],
 'source': ['../evaluators/source-policy','evaluate','source-record'],
 'route': ['../evaluators/workflow-route','evaluate','intake-record'],
 'skills': ['../evaluators/skill-compatibility','evaluate','workflow-record'],
 'binding': ['../evaluators/directive-spine-binding','evaluate','directive-spine'],
 'directive': ['../evaluators/directive-gate','evaluate','directive-spine'],
 'trust': ['../evaluators/workflow-execution-trust','evaluate','workflow-execution-trust'],
 'compose': ['../evaluators/directive-execution','evaluate','directive-execution']
};
const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
function check(kind, record, options={}) {
 if (!TYPES[kind]) throw Error('Unknown check: '+kind);
 const [file,fn,schema] = TYPES[kind];
 const invalid=errors(schema,record);
 if(invalid.length)return normalize({computed_gate:'HALT',record_verdict:'FAIL',findings:invalid});
 const evaluate=require(file)[fn];
 let result;
 if(['action','trust'].includes(kind)) result=evaluate(options.policy||read(path.join(__dirname,'../policies',kind==='action'?'action-permission-matrix.json':'workflow-execution-input-trust.json')),record);
 else if(kind==='route')result=evaluate(options.workflow,record);
 else if(['skills','binding'].includes(kind))result=evaluate(record,options.skills);
 else if(['source','directive'].includes(kind)){if(!options.as_of)throw Error('--as-of is required for time-sensitive checks');result=evaluate(record,options.as_of);}
 else result=evaluate(record);
 return normalize(result);
}
function normalize(result){
 const verdict=result.record_verdict||result.conformance_verdict||result.route_verdict||result.policy_verdict||result.compatibility_verdict||result.binding_verdict||result.verdict;
 const gate=result.computed_gate||result.execution_state||result.release_gate||result.effective_gate||result.binding_gate||result.gate||(verdict==='PASS'?'ALLOW':verdict==='REVIEW'?'REVIEW':'HALT');
 const decision=verdict==='FAIL'?'HALT':gate==='BLOCKER'?'REVIEW':gate;
 return {decision,record_status:verdict||'UNKNOWN',next_action:decision==='ALLOW'?'This check passed. Confirm all other authority and execution controls before acting.':decision==='REVIEW'?'Resolve the review reasons and obtain required evidence or approval, then rerun.':'Stop. Correct invalid input or the blocking condition, then rerun.',result};
}
module.exports={check,normalize,TYPES};
