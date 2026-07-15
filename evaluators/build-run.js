#!/usr/bin/env node
'use strict';

const fs = require('fs');

function evaluate(record) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const item of record.verification.checks) counts[item.status] += 1;
  const violations = [];
  if (record.verification.passed_count !== counts.PASS) violations.push('passed_count does not match checks');
  if (record.verification.failed_count !== counts.FAIL) violations.push('failed_count does not match checks');
  if (record.verification.skipped_count !== counts.SKIP) violations.push('skipped_count does not match checks');
  if (counts.FAIL > 0 && record.result.gate === 'ALLOW') violations.push('failed verification cannot produce ALLOW');
  if (record.result.gate === 'ALLOW' && !['not_required', 'approved'].includes(record.approval_state)) violations.push('ALLOW requires completed or unnecessary approval');
  if (record.failures.some((item) => item.disposition === 'owned_blocker') && record.result.gate === 'ALLOW') violations.push('open owned blocker cannot produce ALLOW');

  return {
    run_id: record.run_id,
    record_verdict: violations.length === 0 ? 'PASS' : 'FAIL',
    computed_counts: {passed_count: counts.PASS, failed_count: counts.FAIL, skipped_count: counts.SKIP},
    gate: record.result.gate,
    violations
  };
}

if (require.main === module) {
  const [recordPath] = process.argv.slice(2);
  if (!recordPath) {
    console.error('Usage: build-run.js <build-run-record.json>');
    process.exit(64);
  }
  const result = evaluate(JSON.parse(fs.readFileSync(recordPath, 'utf8')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.record_verdict === 'PASS' ? 0 : 2);
}

module.exports = { evaluate };
