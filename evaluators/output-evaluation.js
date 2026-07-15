'use strict';

function evaluateOutput(record) {
  const haltReasons = [];
  const reviewReasons = [];
  const checks = [];

  const mandatoryFailures = Array.isArray(record?.requirements)
    ? record.requirements.filter((item) => item.mandatory && ['fail', 'not_applicable'].includes(item.outcome))
    : [];
  const mandatoryReviews = Array.isArray(record?.requirements)
    ? record.requirements.filter((item) => item.mandatory && item.outcome === 'review')
    : [];
  checks.push({ check: 'requirements:no_mandatory_failure', pass: mandatoryFailures.length === 0 });
  if (mandatoryFailures.length > 0) haltReasons.push('One or more mandatory requirements failed or were not evaluated.');
  checks.push({ check: 'requirements:no_mandatory_review', pass: mandatoryReviews.length === 0 });
  if (mandatoryReviews.length > 0) reviewReasons.push('One or more mandatory requirements require review.');

  const openCritical = Array.isArray(record?.defects)
    ? record.defects.filter((item) => item.status === 'open' && item.severity === 'critical')
    : [];
  const openHigh = Array.isArray(record?.defects)
    ? record.defects.filter((item) => item.status === 'open' && item.severity === 'high')
    : [];
  checks.push({ check: 'defects:no_open_critical', pass: openCritical.length === 0 });
  if (openCritical.length > 0) haltReasons.push('A critical defect remains open.');
  checks.push({ check: 'defects:no_open_high', pass: openHigh.length === 0 });
  if (openHigh.length > 0) reviewReasons.push('A high-severity defect remains open.');

  const regressionPassed = record?.regression?.passed === true && (record?.regression?.failed_cases?.length || 0) === 0;
  checks.push({ check: 'regression:passed', pass: regressionPassed });
  if (!regressionPassed) haltReasons.push('Regression verification failed or contains failed cases.');

  const finalEligible = record?.source_summary?.final_eligible || 0;
  const staleOrUnknown = record?.source_summary?.stale_or_unknown || 0;
  checks.push({ check: 'sources:final_eligible_present', pass: finalEligible > 0 });
  if (finalEligible === 0) haltReasons.push('No final-eligible evidence supports the artifact.');
  checks.push({ check: 'sources:no_stale_or_unknown', pass: staleOrUnknown === 0 });
  if (staleOrUnknown > 0) reviewReasons.push('Stale or unknown evidence requires review.');

  const scorePass = Number(record?.metrics?.score) >= Number(record?.metrics?.threshold);
  checks.push({ check: 'metrics:score_threshold', pass: scorePass });
  if (!scorePass) reviewReasons.push('Evaluation score is below the release threshold.');
  const confidencePass = Number(record?.metrics?.confidence) >= 0.8;
  checks.push({ check: 'metrics:confidence_threshold', pass: confidencePass });
  if (!confidencePass) reviewReasons.push('Evaluation confidence is below 0.80.');

  if (record?.approval?.status === 'rejected') haltReasons.push('Required approval was rejected.');
  else if (record?.approval?.required && record?.approval?.status !== 'approved') {
    reviewReasons.push('Required approval remains pending.');
  }

  let releaseGate = 'ALLOW';
  if (haltReasons.length > 0) releaseGate = 'HALT';
  else if (reviewReasons.length > 0) releaseGate = 'REVIEW';

  const declaredGate = record?.gate?.state;
  const gateConsistent = declaredGate === releaseGate;
  checks.push({ check: 'gate:declared_matches_computed', pass: gateConsistent });

  const recordFailures = [];
  if (!gateConsistent) recordFailures.push(`Declared gate ${declaredGate || 'missing'} does not match computed gate ${releaseGate}.`);

  return {
    evaluation_id: record?.evaluation_id || null,
    record_verdict: recordFailures.length > 0 ? 'FAIL' : 'PASS',
    release_gate: releaseGate,
    record_failures: recordFailures,
    halt_reasons: haltReasons,
    review_reasons: reviewReasons,
    checks
  };
}

if (require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node evaluators/output-evaluation.js <evaluation-record.json>');
    process.exit(64);
  }
  const record = JSON.parse(fs.readFileSync(path, 'utf8'));
  const result = evaluateOutput(record);
  console.log(JSON.stringify(result, null, 2));
  if (result.record_verdict === 'FAIL') process.exit(2);
  process.exit(result.release_gate === 'ALLOW' ? 0 : 1);
}

module.exports = { evaluateOutput };
