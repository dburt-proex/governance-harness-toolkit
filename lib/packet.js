'use strict';
const fs=require('fs');
const {errors}=require('./validation');
function markdown(packet){
 const failures=errors('review-packet',packet);if(failures.length)throw Error(failures.join('; '));
 const clean=x=>String(x).replace(/[\r\n|]/g,' ');
 return '# GHT decision review\n\nPurpose: '+clean(packet.purpose)+'\n\nDecision: **'+packet.decision+'**\n\nBusiness outcome: **UNKNOWN**. This workflow checked records and evidence; it executed no business action.\n\n| Time | Event | Detail |\n| --- | --- | --- |\n'+packet.events.map(e=>'| '+clean(e.at)+' | '+clean(e.type)+' | '+clean(e.detail)+' |').join('\n')+'\n\n## Evidence checks\n\n```json\n'+JSON.stringify(packet.evidence,null,2)+'\n```\n\n## Record checks\n\n```json\n'+JSON.stringify(packet.check,null,2)+'\n```\n\nNext: '+clean(packet.next_action)+'\n';
}
function run(args){const packet=JSON.parse(fs.readFileSync(args[1],'utf8'));const content=markdown(packet);if(args[0]==='export'){if(!args[2])throw Error('Specify output.md');fs.writeFileSync(args[2],content,{flag:'wx'});console.log('Review packet exported: '+args[2]);}else console.log(content);return 0;}
module.exports={markdown,run};
