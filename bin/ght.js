#!/usr/bin/env node
'use strict';
const fs=require('fs');
const {check,TYPES}=require('../lib/check');
function main(args){
 if(!args.length||args.includes('--help')){console.log('Usage: npm run ght -- check <'+Object.keys(TYPES).join('|')+'> <record.json> [--policy file] [--workflow file] [--skills file] [--as-of time] [--json]\nOther commands: intake <output.json>, timeline <packet.json>, export <packet.json> <output.md>, demo [--json]\nreview-decision <record.json> <manifest.json> <evidence-root> <new-packet.json> [--trust-store file] [--as-of time]\nNo command executes business actions.');return 0;}
 if(args[0]==='intake')return require('../lib/intake').run(args[1]);
 if(args[0]==='timeline'||args[0]==='export')return require('../lib/packet').run(args);
 if(args[0]==='demo')return require('../adapters/local-decision-review').run(args.includes('--json'));
 if(args[0]==='review-decision'){
   if(args.length<5)throw Error('review-decision <record.json> <manifest.json> <evidence-root> <new-packet.json> [--trust-store file] [--as-of time]');
   const options={};for(let i=5;i<args.length;i++){if(!args[i+1])throw Error('Missing option value');if(args[i]==='--trust-store')options.trustStore=JSON.parse(fs.readFileSync(args[++i],'utf8'));else if(args[i]==='--as-of')options.asOf=args[++i];else throw Error('Unknown option');}
   const packet=require('../adapters/local-decision-review').write(...args.slice(1,5),options);console.log('Decision: '+packet.decision+'\nPacket saved: '+args[4]+'\nNext: '+packet.next_action);return packet.decision==='ALLOW'?0:packet.decision==='REVIEW'?1:2;
 }
 if(args[0]!=='check'||args.length<3)throw Error('Expected check <type> <record.json>; use --help');
 const options={};let json=false;
 for(let i=3;i<args.length;i++) {if(args[i]==='--json'){json=true;continue;}const names={'--policy':'policy','--workflow':'workflow','--skills':'skills','--as-of':'as_of'};if(!names[args[i]]||!args[i+1])throw Error('Unknown or incomplete option: '+args[i]);const name=names[args[i++]];options[name]=name==='as_of'?args[i]:JSON.parse(fs.readFileSync(args[i],'utf8'));}
 const output=check(args[1],JSON.parse(fs.readFileSync(args[2],'utf8')),options);
 if(json)console.log(JSON.stringify(output,null,2));else {
   const reasons=['findings','failures','violations','halt_reasons','review_reasons','hard_violations','reviews','reasons','record_failures'].flatMap(k=>output.result[k]||[]);
   console.log('Decision: '+output.decision+'\nRecord: '+output.record_status+'\nFindings: '+JSON.stringify(reasons.length?reasons:output.result.checks,null,2)+'\nNext: '+output.next_action);
 }
 return output.decision==='ALLOW'?0:output.decision==='REVIEW'?1:2;
}
if(require.main===module)Promise.resolve().then(()=>main(process.argv.slice(2))).then(code=>{process.exitCode=code;}).catch(e=>{console.error('Decision: HALT\nReason: '+e.message+'\nNext: Fix the input or command; no action was executed.');process.exitCode=2;});
module.exports={main};
