#!/usr/bin/env node
'use strict';

const fs = require('fs');

function includes(condition, value) {
  return condition === undefined || condition.includes(value);
}

function matches(rule, request) {
  const w = rule.when || {};
  if (!includes(w.operation, request.operation)) return false;
  if (!includes(w.connector_class, request.connector.class)) return false;
  if (!includes(w.environment, request.connector.environment)) return false;
  if (!includes(w.data_sensitivity, request.data_sensitivity)) return false;
  if (!includes(w.reversibility, request.reversibility)) return false;
  if (!includes(w.external_effect, request.external_effect)) return false;
  if (!includes(w.scope_authorized, request.scope_authorized)) return false;
  if (!includes(w.requester_authority, request.requester.authority)) return false;
  if (w.risk_any && !w.risk_any.some((key) => request.risk_signals[key] === true)) return false;
  if (w.risk_all && !w.risk_all.every((key) => request.risk_signals[key] === true)) return false;
  return true;
}

function effectiveGate(policyGate, approval) {
  if (policyGate === 'HALT') return 'HALT';
  if (policyGate === 'ALLOW') return 'ALLOW';
  if (approval.status === 'approved') return 'ALLOW';
  if (approval.status === 'rejected') return 'HALT';
  return 'REVIEW';
}

function evaluate(matrix, request) {
  const ordered = [...matrix.rules].sort((a, b) => b.priority - a.priority);
  const matched = ordered.find((rule) => matches(rule, request));
  const policyGate = matched ? matched.gate : matrix.default_gate;
  const executionState = effectiveGate(policyGate, request.human_approval);
  const declaredMatches = request.declared_gate === policyGate;
  return {
    action_id: request.action_id,
    policy_id: matrix.policy_id,
    policy_version: matrix.version,
    matched_rule: matched ? matched.rule_id : null,
    policy_gate: policyGate,
    execution_state: executionState,
    record_verdict: declaredMatches ? 'PASS' : 'FAIL',
    required_controls: matched ? matched.required_controls : ['human-review'],
    checks: {
      declared_gate_matches_policy: declaredMatches,
      scope_authorized: request.scope_authorized,
      approval_status: request.human_approval.status
    },
    rationale: matched ? matched.rationale : 'No explicit rule matched; the default review gate applies.'
  };
}

if (require.main === module) {
  const [matrixPath, requestPath] = process.argv.slice(2);
  if (!matrixPath || !requestPath) {
    console.error('Usage: action-permission.js <matrix.json> <action-request.json>');
    process.exit(64);
  }
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  const result = evaluate(matrix, request);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.record_verdict === 'FAIL' ? 2 : result.execution_state === 'ALLOW' ? 0 : 1);
}

module.exports = { evaluate, matches };
