#!/usr/bin/env node
'use strict';

const fs = require('fs');

const GOVERNANCE_MUTATIONS = new Set(['policy_rule', 'skill_update']);
const HIGH_SEVERITY = new Set(['high', 'critical']);

function evaluate(review) {
  const reasons = [];
  const metrics = {
    observation_count: review.observations.length,
    implemented_count: review.observations.filter((x) => x.improvement.status === 'implemented').length,
    open_blocker_count: review.observations.filter((x) => x.improvement.status === 'blocked').length
  };
  let computedGate = 'ALLOW';

  for (const observation of review.observations) {
    const improvement = observation.improvement;
    if (HIGH_SEVERITY.has(observation.severity) && !improvement.regression_fixture_ref) {
      computedGate = 'HALT';
      reasons.push(`${observation.observation_id}: high-severity learning lacks a regression fixture`);
    }
    if (improvement.status === 'implemented' && !improvement.verification_ref) {
      computedGate = 'HALT';
      reasons.push(`${observation.observation_id}: implementation lacks verification evidence`);
    }
    if (GOVERNANCE_MUTATIONS.has(improvement.type) && improvement.status === 'implemented' &&
        (improvement.approval.required !== true || improvement.approval.status !== 'approved')) {
      computedGate = 'HALT';
      reasons.push(`${observation.observation_id}: governance mutation lacks approved human authorization`);
    }
    if (computedGate !== 'HALT' && ['proposed', 'approved', 'blocked'].includes(improvement.status)) {
      computedGate = 'REVIEW';
    }
    if (improvement.status === 'blocked') reasons.push(`${observation.observation_id}: owned blocker remains open`);
    if (improvement.status === 'proposed' || improvement.status === 'approved') reasons.push(`${observation.observation_id}: improvement awaits completion`);
  }

  const metricsMatch = Object.keys(metrics).every((key) => review.metrics[key] === metrics[key]);
  const gateMatches = review.declared_gate === computedGate;
  if (!metricsMatch) reasons.push('declared metrics do not match computed metrics');
  if (!gateMatches) reasons.push('declared gate does not match computed gate');

  return {
    review_id: review.review_id,
    computed_gate: computedGate,
    record_verdict: metricsMatch && gateMatches ? 'PASS' : 'FAIL',
    computed_metrics: metrics,
    checks: {
      metrics_match: metricsMatch,
      declared_gate_matches: gateMatches,
      all_observations_dispositioned: review.observations.every((x) => Boolean(x.improvement.owner && x.improvement.next_action))
    },
    reasons
  };
}

if (require.main === module) {
  const [reviewPath] = process.argv.slice(2);
  if (!reviewPath) {
    console.error('Usage: learning-review.js <learning-review.json>');
    process.exit(64);
  }
  const result = evaluate(JSON.parse(fs.readFileSync(reviewPath, 'utf8')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.record_verdict === 'FAIL' ? 2 : result.computed_gate === 'ALLOW' ? 0 : 1);
}

module.exports = { evaluate };
