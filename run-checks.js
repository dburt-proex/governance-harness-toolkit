#!/usr/bin/env node
'use strict';
const {spawnSync}=require('child_process');
const fs=require('fs');
const path=require('path');
function run(args){return spawnSync(process.execPath,args,{cwd:__dirname,encoding:'utf8',maxBuffer:8*1024*1024});}
const legacy=run(['run-regression.js','--json']);
const tests=fs.readdirSync(path.join(__dirname,'tests')).filter(x=>x.endsWith('.test.js')).sort().map(x=>'tests/'+x);
const modern=run(['--test','--test-reporter=tap',...tests]);
let regression;try{regression=JSON.parse(legacy.stdout);}catch{regression={status:'FAIL',errors:[legacy.stderr||'Regression runner emitted invalid JSON']};}
const count=name=>Number((modern.stdout.match(new RegExp('^# '+name+' (\\d+)$','m'))||[])[1]||0);
const status=legacy.status===0&&modern.status===0&&count('tests')>0?'PASS':'FAIL';
const result={suite:'ght-complete',status,regression,operability:{total:count('tests'),passed:count('pass'),failed:count('fail'),exit_code:modern.status},errors:status==='PASS'?[]:[legacy.stderr,modern.stderr,modern.stdout].filter(Boolean)};
if(process.argv.includes('--json'))console.log(JSON.stringify(result));else{console.log('GHT complete checks: '+status);console.log('Regression: '+JSON.stringify(regression.summary));console.log('Operability: '+JSON.stringify(result.operability));if(status!=='PASS')console.error(result.errors.join('\n'));}
process.exitCode=status==='PASS'?0:1;
