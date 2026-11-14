'use strict';
const {evaluate: directiveGate} = require('./directive-gate');
const {evaluate: bindingGate} = require('./directive-spine-binding');
const {evaluate: trustGate} = require('./workflow-execution-trust');
const {errors} = require('../lib/validation');
const ACTION = {read: 'read', search: 'search', execute: 'execute', edit: 'repository_edit', github_write: 'github_write', network: 'network', credential: 'credential', permission: 'permission_change', merge: 'merge_pull_request', deploy: 'deploy'};
const RANK = {ALLOW: 0, REVIEW: 1, HALT: 2};
function evaluate(bundle) {
  const failures = errors('directive-execution', bundle);
  if (failures.length) return {computed_gate: 'HALT', record_verdict: 'FAIL', findings: failures};
  const {directive, request, skills, policy, as_of} = bundle;
  failures.push(...errors('directive-spine', directive), ...errors('workflow-execution-trust', request), ...errors('workflow-trust-policy', policy));
  for (const skill of skills) failures.push(...errors('skill-record', skill));
  if (failures.length) return {computed_gate: 'HALT', record_verdict: 'FAIL', findings: failures};
  const results = {directive: directiveGate(directive, as_of), binding: bindingGate(directive, skills), trust: trustGate(policy, request)};
  const findings = [];
  const gates = [results.directive.computed_gate, results.binding.binding_gate, results.trust.computed_gate];
  if (results.directive.record_verdict !== 'PASS' || results.trust.conformance_verdict !== 'PASS') gates.push('HALT');
  for (const [name, grant] of Object.entries(request.authority)) {
    if (grant.requested && directive.authority.scope.action_permissions[ACTION[name]] !== 'authorized') findings.push(`Authority exceeds directive: ${name}`);
  }
  for (const target of request.targets) {
    // Exact literal paths only: a directory-looking grant never implies descendants.
    if (!directive.authority.scope.allowed_paths.includes(target)) findings.push(`Target outside directive: ${target}`);
  }
  if (bundle.repository !== directive.intent.target.repository) findings.push('Repository does not match directive');
  if (bundle.commit_sha !== request.evidence.commit_sha || directive.intent.target.base_ref !== bundle.commit_sha) findings.push('Exact commit does not match directive and execution evidence');
  const effects = directive.authority.scope.external_effects;
  const external = ['github_write', 'network', 'credential', 'permission', 'merge', 'deploy'].some(name => request.authority[name].requested);
  if (external && effects === 'prohibited') findings.push('External effects prohibited by directive');
  if (external && effects === 'review_required') gates.push('REVIEW');
  if (findings.length) gates.push('HALT');
  const computed_gate = gates.reduce((a,b) => RANK[b] > RANK[a] ? b : a, 'ALLOW');
  return {computed_gate, record_verdict: findings.length || results.directive.record_verdict !== 'PASS' || results.trust.conformance_verdict !== 'PASS' ? 'FAIL' : 'PASS', findings, results};
}
module.exports = {evaluate, ACTION};
