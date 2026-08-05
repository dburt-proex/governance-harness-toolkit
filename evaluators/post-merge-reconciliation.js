#!/usr/bin/env node
'use strict';

const fs = require('fs');

function evaluate(records) {
  const mismatches = [];
  const blockers = [];

  for (const record of records.items) {
    const states = [record.backlog.state, record.ledger.state, record.pull_request.state];
    const evidence = [record.backlog.promotion_evidence, record.ledger.promotion_evidence, record.pull_request.promotion_evidence];

    if (new Set(states).size !== 1) mismatches.push(`${record.work_item}: backlog, ledger, and pull-request states disagree`);
    if (new Set(evidence).size !== 1) mismatches.push(`${record.work_item}: promotion evidence disagrees`);
    if (states.every((state) => state === 'merged') && evidence.every((state) => state === 'MISSING')) {
      blockers.push(`${record.work_item}: merged work lacks promotion approval evidence`);
    }
  }

  const computedGate = mismatches.length ? 'HALT' : blockers.length ? 'BLOCKER' : 'ALLOW';
  const declaredMatches = records.declared_gate === computedGate;
  return {
    computed_gate: computedGate,
    record_verdict: mismatches.length === 0 && declaredMatches ? 'PASS' : 'FAIL',
    checks: { records_agree: mismatches.length === 0, declared_gate_matches: declaredMatches },
    mismatches,
    blockers
  };
}

if (require.main === module) {
  const [recordsPath] = process.argv.slice(2);
  if (!recordsPath) {
    console.error('Usage: post-merge-reconciliation.js <reconciliation-record.json>');
    process.exit(64);
  }
  const result = evaluate(JSON.parse(fs.readFileSync(recordsPath, 'utf8')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.record_verdict === 'FAIL' ? 2 : result.computed_gate === 'ALLOW' ? 0 : 1);
}

module.exports = { evaluate };
