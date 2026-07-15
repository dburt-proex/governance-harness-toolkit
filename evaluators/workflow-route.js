#!/usr/bin/env node
'use strict';

const fs = require('fs');

const EXTERNAL_WRITE_RANK = {prohibited: 0, review_required: 1, authorized: 2};
const SENSITIVITY_RANK = {none: 0, internal: 1, confidential: 2, restricted: 3};

function evaluate(workflow, intake) {
  const hardViolations = [];
  const reviewReasons = [];
  if (workflow.status !== 'approved') hardViolations.push('workflow is not approved');
  if (intake.routing.workflow !== workflow.workflow_key) hardViolations.push('intake workflow key does not match registry record');

  const routedSkills = new Set(intake.routing.required_skills);
  const missingSkills = workflow.skills.filter((item) => item.required && !routedSkills.has(item.skill_id)).map((item) => item.skill_id);
  if (missingSkills.length) hardViolations.push(`missing required skills: ${missingSkills.join(', ')}`);

  const deliverables = new Map(workflow.deliverables.map((item) => [item.artifact_type, item]));
  for (const output of intake.requested_outputs) {
    const contract = deliverables.get(output.artifact_type);
    if (!contract) hardViolations.push(`unsupported artifact type: ${output.artifact_type}`);
    else if (!contract.formats.includes(output.format)) hardViolations.push(`unsupported format for ${output.artifact_type}: ${output.format}`);
  }

  if (!intake.source_policy.allowed_classes.every((value) => workflow.evidence_policy.allowed_classes.includes(value))) hardViolations.push('intake source classes exceed workflow evidence policy');
  if (workflow.evidence_policy.citation_required && !intake.source_policy.citation_required) hardViolations.push('workflow requires citations');
  if (workflow.evidence_policy.freshness_required && !intake.source_policy.freshness_required) hardViolations.push('workflow requires freshness checks');
  if (EXTERNAL_WRITE_RANK[intake.action_policy.external_writes] > EXTERNAL_WRITE_RANK[workflow.action_policy.max_external_writes]) hardViolations.push('intake external-write authority exceeds workflow');
  if (SENSITIVITY_RANK[intake.action_policy.sensitive_data] > SENSITIVITY_RANK[workflow.action_policy.sensitive_data_ceiling]) hardViolations.push('intake sensitivity exceeds workflow ceiling');
  if (!intake.action_policy.allowed_actions.every((value) => workflow.action_policy.allowed_actions.includes(value))) hardViolations.push('intake contains actions outside workflow authority');

  if (!workflow.intake_policy.allowed_risk_levels.includes(intake.risk_level)) reviewReasons.push(`risk level ${intake.risk_level} requires review`);
  if (!workflow.intake_policy.allowed_requester_authorities.includes(intake.requester.authority)) reviewReasons.push(`requester authority ${intake.requester.authority} requires review`);
  if (workflow.intake_policy.allowed_domains && workflow.intake_policy.allowed_domains.length && !workflow.intake_policy.allowed_domains.includes(intake.domain)) reviewReasons.push(`domain ${intake.domain} requires review`);
  if (workflow.quality_gates.approval_required) reviewReasons.push('workflow requires approval');

  const computedGate = hardViolations.length ? 'HALT' : reviewReasons.length ? 'REVIEW' : 'ALLOW';
  const declaredMatches = intake.routing.decision_state === computedGate;
  return {
    intake_id: intake.intake_id,
    workflow_id: workflow.workflow_id,
    computed_gate: computedGate,
    route_verdict: hardViolations.length === 0 && declaredMatches ? 'PASS' : 'FAIL',
    checks: {declared_gate_matches: declaredMatches, required_skills_present: missingSkills.length === 0},
    hard_violations: hardViolations,
    review_reasons: reviewReasons
  };
}

if (require.main === module) {
  const [workflowPath, intakePath] = process.argv.slice(2);
  if (!workflowPath || !intakePath) {
    console.error('Usage: workflow-route.js <workflow-record.json> <intake-record.json>');
    process.exit(64);
  }
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
  const result = evaluate(workflow, intake);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.route_verdict === 'FAIL' ? 2 : result.computed_gate === 'ALLOW' ? 0 : 1);
}

module.exports = { evaluate };
