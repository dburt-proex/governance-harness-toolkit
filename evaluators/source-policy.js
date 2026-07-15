#!/usr/bin/env node
'use strict';

const fs = require('fs');

function isoDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function check(checks, id, passed, severity, detail) {
  checks.push({ id, passed, severity, detail });
}

function evaluate(record, asOf) {
  const checks = [];
  const reference = isoDate(asOf);
  const lastChecked = isoDate(record.freshness.last_checked);
  const nextReview = isoDate(record.freshness.next_review);
  const expiry = lastChecked ? addDays(lastChecked, record.freshness.window_days) : null;

  if (!reference || !lastChecked || !nextReview || !expiry) {
    return {
      source_id: record.source_id,
      as_of: asOf,
      effective_gate: 'HALT',
      policy_verdict: 'FAIL',
      final_eligible: false,
      checks: [{ id: 'valid-policy-dates', passed: false, severity: 'hard', detail: 'Policy dates must be valid ISO dates.' }],
      reasons: ['Cannot evaluate source policy with invalid dates.']
    };
  }

  const expectedFreshness = reference > expiry ? 'expired' : reference >= nextReview ? 'due' : 'current';
  check(checks, 'freshness-status-coherent', ['unknown', 'review_required'].includes(record.freshness.status) || record.freshness.status === expectedFreshness, 'hard', `declared=${record.freshness.status}, computed=${expectedFreshness}`);
  check(checks, 'freshness-date-order', lastChecked <= reference && nextReview >= lastChecked, 'hard', 'last_checked must not be in the future and next_review must not precede it');
  check(checks, 'authority-tier-role-coherent', (record.authority_tier === 1 ? record.authority_role === 'authoritative' : true) && (record.authority_role === 'authoritative' ? record.authority_tier <= 2 : true), 'hard', 'Tier 1 requires authoritative role; authoritative sources must be tier 1 or 2');
  check(checks, 'discovery-boundary-coherent', record.source_type !== 'discovery' || (record.authority_role === 'discovery_only' && ['context_only', 'blocked'].includes(record.decision_eligibility)), 'hard', 'Discovery sources cannot be authoritative or final-eligible');
  check(checks, 'discovery-role-coherent', record.authority_role !== 'discovery_only' || (record.source_type === 'discovery' && ['context_only', 'blocked'].includes(record.decision_eligibility)), 'hard', 'Discovery-only role requires discovery source type and non-final eligibility');
  check(checks, 'lifecycle-usable', !['rejected', 'retired', 'unavailable'].includes(record.lifecycle_status) || record.decision_eligibility === 'blocked', 'hard', 'Terminal lifecycle states must be blocked from decision use');

  const finalRequirements = record.decision_eligibility !== 'final' || (
    record.lifecycle_status === 'approved' &&
    ['primary', 'internal'].includes(record.source_type) &&
    record.authority_role === 'authoritative' &&
    record.authority_tier <= 2 &&
    record.freshness.status === 'current' &&
    record.freshness.material_change === false
  );
  check(checks, 'final-eligibility-coherent', finalRequirements, 'hard', 'Final eligibility requires approved primary/internal authoritative current evidence with no material change');

  const violations = checks.filter((item) => !item.passed);
  const hardViolation = violations.some((item) => item.severity === 'hard');
  const finalEligible = violations.length === 0 && record.decision_eligibility === 'final';
  const effectiveGate = hardViolation || record.decision_eligibility === 'blocked' || record.freshness.status === 'expired' ? 'HALT' : finalEligible ? 'ALLOW' : 'REVIEW';

  return {
    source_id: record.source_id,
    as_of: asOf,
    effective_gate: effectiveGate,
    policy_verdict: violations.length === 0 ? 'PASS' : 'FAIL',
    final_eligible: finalEligible,
    computed_freshness: expectedFreshness,
    checks,
    reasons: violations.map((item) => `${item.id}: ${item.detail}`)
  };
}

if (require.main === module) {
  const [recordPath, asOf] = process.argv.slice(2);
  if (!recordPath || !asOf) {
    console.error('Usage: source-policy.js <source-record.json> <as-of YYYY-MM-DD>');
    process.exit(64);
  }
  const result = evaluate(JSON.parse(fs.readFileSync(recordPath, 'utf8')), asOf);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.policy_verdict === 'FAIL' ? 2 : result.effective_gate === 'ALLOW' ? 0 : 1);
}

module.exports = { evaluate };
