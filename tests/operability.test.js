'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {spawnSync}=require('child_process');
const {check,TYPES,normalize}=require('../lib/check');
const {errors}=require('../lib/validation');
const {verify,digest}=require('../lib/evidence');
const {review,write}=require('../adapters/local-decision-review');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
const bundle=()=>read('examples/directive-execution/bounded-review.json');
for(const kind of Object.keys(TYPES))test(kind+' malformed input fails closed',()=>{const r=check(kind,{});assert.equal(r.decision,'HALT');assert.equal(r.record_status,'FAIL');});
test('original missing actor/input/target exploit is closed in direct API',()=>{
 const r=read('examples/workflow-execution-trust/scoped-staged-write.json');delete r.actor;delete r.inputs;delete r.targets;
 const result=require('../evaluators/workflow-execution-trust').evaluate(read('policies/workflow-execution-input-trust.json'),r);
 assert.equal(result.computed_gate,'HALT');assert.equal(result.conformance_verdict,'FAIL');
});
test('all direct APIs reject null without throwing',()=>{for(const [file,fn] of Object.values(TYPES))assert.equal(normalize(require(file)[fn](null,null)).decision,'HALT',file);});
test('malformed policies fail closed',()=>{const r=read('examples/workflow-execution-trust/scoped-staged-write.json');for(const p of [null,{}, {authorities:{}},{input_trust_classes:[null]}])assert.equal(require('../evaluators/workflow-execution-trust').evaluate(p,r).computed_gate,'HALT');});
test('composition permits exact scope and does not mutate input',()=>{const b=bundle(),before=JSON.stringify(b);assert.equal(check('compose',b).decision,'ALLOW');assert.equal(JSON.stringify(b),before);});
const mutations={
 'authority widening':b=>{b.request.authority.network={requested:true,scope_authorized:true};},
 'path widening':b=>{b.request.targets=['evaluators/other.js'];},
 'path prefix confusion':b=>{b.directive.authority.scope.allowed_paths=['evaluators'];},
 'repository mismatch':b=>{b.repository='other/repository';},
 'commit mismatch':b=>{b.commit_sha='b'.repeat(40);},
 'expired directive':b=>{b.as_of='2026-10-01T00:00:00Z';},
 'skill substitution':b=>{b.directive.skill_binding.definition_sha256='f'.repeat(64);},
 'missing nested fields':b=>{delete b.request.targets;},
 'malformed nested policy':b=>{b.policy={};},
 'model override':b=>{b.request.gates.model_override_requested=true;},
 'external effect widening':b=>{b.request.authority.network={requested:true,scope_authorized:true};b.directive.authority.scope.action_permissions.network='authorized';},
 'rejected approval':b=>{b.request.gates.human_approval={status:'rejected'};}
};
for(const [name,mutate] of Object.entries(mutations))test('composition rejects '+name,()=>{const b=bundle();mutate(b);assert.equal(check('compose',b).decision,'HALT');});
test('composition preserves missing evidence REVIEW',()=>{const b=bundle();b.request.gates.diffwall_evidence='MISSING';b.request.declared_gate='REVIEW';assert.equal(check('compose',b).decision,'REVIEW');});
test('source rejects impossible dates',()=>{assert.ok(errors('source-evaluation-date','2026-02-30').length);});
test('intake is schema valid without claiming authority',()=>{const r=require('../lib/intake').create({name:'Drew',objective:'Prepare a public research brief',success:'All main claims have citations'});assert.deepEqual(errors('intake-record',r),[]);assert.equal(r.requester.authority,'contributor');assert.equal(r.routing.decision_state,'REVIEW');});
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ght-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function sign(m,privateKey){const a=m.approval;a.signature=crypto.sign(null,Buffer.from(JSON.stringify({subject_sha256:m.subject_sha256,files:m.files,approver:a.approver,expires_at:a.expires_at,key_id:a.key_id})),privateKey).toString('base64');}
test('evidence verifies bytes and signed approvals, rejects substitutions',t=>{
 const root=temp(t),subject=Buffer.from('subject'),source=Buffer.from('source');
 fs.writeFileSync(path.join(root,'source.md'),source);
 const m={subject_sha256:digest(subject),files:[{path:'source.md',sha256:digest(source)}]};
 assert.equal(verify(m,root,subject).computed_gate,'ALLOW');
 assert.equal(verify(m,root,Buffer.from('other')).computed_gate,'HALT');
 fs.writeFileSync(path.join(root,'source.md'),'changed');assert.equal(verify(m,root,subject).computed_gate,'HALT');fs.writeFileSync(path.join(root,'source.md'),source);
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 m.approval={key_id:'test',approver:'Owner Test',expires_at:'2026-12-01T00:00:00Z'};sign(m,privateKey);
 const trust={keys:{test:publicKey.export({type:'spki',format:'pem'})}};
 assert.equal(verify(m,root,subject,trust,'2026-11-14T00:00:00Z').approval_verified,true);
 assert.equal(verify(m,root,subject,null,'2026-11-14T00:00:00Z').computed_gate,'REVIEW');
 assert.equal(verify(m,root,subject,trust,'2026-12-02T00:00:00Z').computed_gate,'HALT');
 m.approval.approver='Substituted';assert.equal(verify(m,root,subject,trust,'2026-11-14T00:00:00Z').computed_gate,'HALT');
 for(const target of ['../escape','/absolute','C:/outside','a/../source.md','a\\source.md'])assert.equal(verify({subject_sha256:digest(subject),files:[{path:target,sha256:'a'.repeat(64)}]},root,subject).computed_gate,'HALT');
});
test('duplicate paths and source IDs fail closed',t=>{
 const root=temp(t),bytes=Buffer.from('source');fs.writeFileSync(path.join(root,'source.md'),bytes);
 const file={path:'source.md',source_id:'SRC-TEST-001',sha256:digest(bytes)};
 assert.equal(verify({subject_sha256:digest(bytes),files:[file,clone(file)]},root,bytes).computed_gate,'HALT');
});
test('adapter fails closed on malformed decision and manifest without inventing outcomes',t=>{
 const root=temp(t);
 for(const value of [null,{}, {evidence:'invalid',decision:{statement:42}}]){
  const packet=review(Buffer.from(JSON.stringify(value)),null,root);
  assert.equal(packet.decision,'HALT');assert.equal(packet.business_outcome,'UNKNOWN');assert.deepEqual(errors('review-packet',packet),[]);
 }
});
test('adapter retains unknown outcome and refuses packet overwrite',t=>{
 const root=temp(t),bytes=fs.readFileSync('examples/decision-record/approved-source-registry.json'),m={subject_sha256:digest(bytes),files:[]};
 const packet=review(bytes,m,root,{asOf:'2026-11-14T00:00:00Z'});
 assert.equal(packet.decision,'REVIEW');assert.equal(packet.business_outcome,'UNKNOWN');assert.deepEqual(errors('review-packet',packet),[]);
 assert.ok(require('../lib/packet').markdown(packet).includes('Business outcome: **UNKNOWN**'));
 fs.writeFileSync(path.join(root,'record.json'),bytes);fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(m));
 write(path.join(root,'record.json'),path.join(root,'manifest.json'),root,path.join(root,'packet.json'));
 assert.throws(()=>write(path.join(root,'record.json'),path.join(root,'manifest.json'),root,path.join(root,'packet.json')),/EEXIST/);
});
test('adapter requires source IDs and matching trusted approver',t=>{
 const root=temp(t),record=read('examples/decision-record/approved-source-registry.json'),subject=Buffer.from(JSON.stringify(record)),source=Buffer.from('test evidence');
 fs.writeFileSync(path.join(root,'source.md'),source);
 const m={subject_sha256:digest(subject),files:[{path:'source.md',source_id:record.evidence[0].source_id,sha256:digest(source)}]};
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 m.approval={key_id:'test',approver:record.approval.approver,expires_at:'2026-12-01T00:00:00Z'};sign(m,privateKey);
 const options={trustStore:{keys:{test:publicKey.export({type:'spki',format:'pem'})}},asOf:'2026-11-14T00:00:00Z'};
 assert.equal(review(subject,m,root,options).decision,'ALLOW');
 m.approval.approver='Other Signer';sign(m,privateKey);assert.equal(review(subject,m,root,options).decision,'REVIEW');
 m.approval.approver=record.approval.approver;m.files[0].source_id='SRC-OTHER-001';sign(m,privateKey);assert.equal(review(subject,m,root,options).decision,'REVIEW');
});
test('CLI returns JSON and correct allow/review/error exit statuses',()=>{
 const run=args=>spawnSync(process.execPath,['bin/ght.js',...args],{encoding:'utf8'});
 const ok=run(['check','skills','examples/workflows/research-brief.json','--skills','examples/skill-record/research-brief-registry.json','--json']);
 assert.equal(ok.status,0,ok.stderr);assert.equal(JSON.parse(ok.stdout).decision,'ALLOW');
 const demo=run(['demo','--json']);assert.equal(demo.status,1,demo.stderr);assert.equal(JSON.parse(demo.stdout).decision,'REVIEW');
 assert.equal(run(['check','unknown','package.json']).status,2);
});
