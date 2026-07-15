'use strict';

function evaluateDecision(record) {
  const failures = [];
  const reviews = [];
  const checks = [];

  const requireField = (value, name) => {
    const present = value !== undefined && value !== null && value !== '';
    checks.push({ check: `required:${name}`, pass: present });
    if (!present) failures.push(`Missing required decision field: ${name}`);
  };

  requireField(record?.decision_id, 'decision_id');
  requireField(record?.intake_id, 'intake_id');
  requireField(record?.owner?.name, 'owner.name');
  requireField(record?.decision?.state, 'decision.state');
  requireField(record?.decision?.rationale, 'decision.rationale');

  const state = record?.decision?.state;
  const supporting = Array.isArray(record?.evidence)
    ? record.evidence.filter((item) => item.role === 'supporting')
    : [];
  const finalCurrent = supporting.filter(
    (item) => item.eligibility === 'final' && ['current', 'due'].includes(item.freshness_status)
  );
  const blockedSupporting = supporting.filter(
    (item) => item.eligibility === 'blocked' || ['expired', 'unknown', 'review_required'].includes(item.freshness_status)
  );

  checks.push({ check: 'supporting_evidence:eligible_current', pass: finalCurrent.length > 0 });
  if (finalCurrent.length === 0) failures.push('No current, final-eligible supporting evidence exists.');
  checks.push({ check: 'supporting_evidence:not_blocked', pass: blockedSupporting.length === 0 });
  if (blockedSupporting.length > 0) failures.push('Supporting evidence is blocked, expired, unknown, or requires review.');

  const selectedAlternatives = Array.isArray(record?.alternatives)
    ? record.alternatives.filter((item) => item.disposition === 'selected')
    : [];
  checks.push({ check: 'alternatives:exactly_one_selected', pass: selectedAlternatives.length === 1 });
  if (selectedAlternatives.length !== 1) failures.push('Exactly one alternative must be selected.');

  const unverifiedMaterialAssumptions = Array.isArray(record?.assumptions)
    ? record.assumptions.filter(
        (item) => item.status === 'unverified' && ['high', 'critical'].includes(item.impact)
      )
    : [];
  checks.push({ check: 'assumptions:no_unverified_material', pass: unverifiedMaterialAssumptions.length === 0 });
  if (unverifiedMaterialAssumptions.length > 0) reviews.push('High-impact or critical assumptions remain unverified.');

  const unmitigatedMaterialRisks = Array.isArray(record?.risks)
    ? record.risks.filter(
        (item) => ['high', 'critical'].includes(item.impact) && item.status === 'open'
      )
    : [];
  checks.push({ check: 'risks:no_open_material', pass: unmitigatedMaterialRisks.length === 0 });
  if (unmitigatedMaterialRisks.length > 0) reviews.push('High-impact or critical risks remain open.');

  if (state === 'ALLOW') {
    const approvalSatisfied = record?.approval?.required
      ? record?.approval?.status === 'approved'
      : record?.approval?.status === 'not_required';
    checks.push({ check: 'allow:approval_satisfied', pass: approvalSatisfied });
    if (!approvalSatisfied) failures.push('ALLOW requires an approved or explicitly not-required approval state.');
    if (record?.lifecycle_status !== 'approved') failures.push('ALLOW requires an approved lifecycle state.');
  } else if (state === 'REVIEW') {
    const reviewGate = record?.approval?.required === true && record?.approval?.status === 'pending';
    checks.push({ check: 'review:pending_approval_gate', pass: reviewGate });
    if (!reviewGate) failures.push('REVIEW requires a pending approval gate.');
    reviews.push('Decision is awaiting human review.');
  } else if (state === 'HALT') {
    if (record?.lifecycle_status !== 'approved') failures.push('HALT requires an approved lifecycle state.');
  } else {
    failures.push('Decision state must be ALLOW, REVIEW, or HALT.');
  }

  let verdict = 'PASS';
  if (failures.length > 0) verdict = 'FAIL';
  else if (reviews.length > 0) verdict = 'REVIEW';

  return {
    decision_id: record?.decision_id || null,
    verdict,
    failures,
    reviews,
    checks
  };
}

if (require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node evaluators/decision-record.js <decision-record.json>');
    process.exit(64);
  }
  const record = JSON.parse(fs.readFileSync(path, 'utf8'));
  const result = evaluateDecision(record);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'FAIL' ? 2 : result.verdict === 'REVIEW' ? 1 : 0);
}

module.exports = { evaluateDecision };
