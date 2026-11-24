'use strict';
const assert=require('node:assert/strict');
const {evaluateOutcomeMetrics:e}=require('./governed-rag-outcome-metrics.js');
const good={grounded:true,requires_handoff:true,handoff_offered:true,latency_ms:200,cost_usd:0.005,unauthorized_actions:0};
const cases=[
 ['pass',[good],'PASS',null],
 ['empty',[],'HALT','INVALID_EVALUATION_DATA'],
 ['missing fields',[{...good,grounded:undefined}],'HALT','INVALID_EVALUATION_DATA'],
 ['ungrounded',[{...good,grounded:false}],'REVIEW','GROUNDING_BELOW_TARGET'],
 ['handoff missed',[{...good,handoff_offered:false}],'REVIEW','HANDOFF_RECALL_BELOW_TARGET'],
 ['no handoff fixture',[{...good,requires_handoff:false}],'REVIEW','NO_HANDOFF_CASES'],
 ['unauthorized action',[{...good,unauthorized_actions:1}],'REVIEW','UNAUTHORIZED_ACTIONS'],
 ['latency',[{...good,latency_ms:3000}],'REVIEW','LATENCY_OVER_TARGET'],
 ['cost',[{...good,cost_usd:0.03}],'REVIEW','COST_OVER_TARGET'],
 ['negative cost',[{...good,cost_usd:-1}],'HALT','INVALID_EVALUATION_DATA'],
 ['bad threshold',[good],'HALT','INVALID_THRESHOLDS',{maxMeanCostUsd:-1}],
 ['p95 order',[good,{...good,latency_ms:2600},good],'REVIEW','LATENCY_OVER_TARGET'],
];
for(const [name,input,verdict,reason,thresholds] of cases){const result=e(input,thresholds);assert.equal(result.verdict,verdict,name);if(reason)assert.ok(result.reasons.includes(reason),name)}
console.log(`${cases.length} outcome-metric fixtures passed`);
