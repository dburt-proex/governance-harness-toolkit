#!/usr/bin/env node
'use strict';

const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const skillRecordSchema = require('../schemas/skill-record.schema.json');
const workflowRecordSchema = require('../schemas/workflow-record.schema.json');

const EXTERNAL_WRITE_RANK = {prohibited: 0, review_required: 1, authorized: 2};
const SENSITIVITY_RANK = {none: 0, internal: 1, confidential: 2, restricted: 3};
const ACTIVE_STATUSES = new Set(['proposed', 'available', 'deprecated']);

function createValidator(schema) {
  const ajv = new Ajv({allErrors: true, strict: false, validateSchema: false});
  addFormats(ajv);
  return ajv.compile(schema);
}

const validateSkillRecord = createValidator(skillRecordSchema);
const validateWorkflowRecord = createValidator(workflowRecordSchema);

function schemaErrors(validate) {
  return (validate.errors || []).map((error) => `${error.instancePath || '/'}: ${error.message}`);
}

function resultFor(workflow, hardViolations, reviewReasons, resolutions) {
  const computedGate = hardViolations.length ? 'HALT' : reviewReasons.length ? 'REVIEW' : 'ALLOW';
  return {
    workflow_id: workflow && workflow.workflow_id ? workflow.workflow_id : null,
    workflow_key: workflow && workflow.workflow_key ? workflow.workflow_key : null,
    workflow_version: workflow && workflow.version ? workflow.version : null,
    computed_gate: computedGate,
    compatibility_verdict: computedGate === 'ALLOW' ? 'PASS' : computedGate === 'REVIEW' ? 'REVIEW' : 'FAIL',
    resolutions,
    hard_violations: hardViolations,
    review_reasons: reviewReasons
  };
}

function capabilityViolations(workflow, record) {
  const violations = [];
  const workflowPolicy = workflow.action_policy;
  const requirements = record.capability_requirements;

  if (EXTERNAL_WRITE_RANK[requirements.external_writes] > EXTERNAL_WRITE_RANK[workflowPolicy.max_external_writes]) {
    violations.push(`Skill ${record.skill_id} external-write requirement exceeds workflow authority`);
  }
  if (SENSITIVITY_RANK[requirements.sensitive_data] > SENSITIVITY_RANK[workflowPolicy.sensitive_data_ceiling]) {
    violations.push(`Skill ${record.skill_id} sensitive-data requirement exceeds workflow ceiling`);
  }
  for (const action of requirements.required_actions) {
    if (!workflowPolicy.allowed_actions.includes(action)) {
      violations.push(`Skill ${record.skill_id} requires disallowed action: ${action}`);
    }
  }
  return violations;
}

function evaluate(workflowRecord, skillRecords) {
  const hardViolations = [];
  const reviewReasons = [];
  const resolutions = [];

  if (!validateWorkflowRecord(workflowRecord)) {
    hardViolations.push(`workflow record is malformed: ${schemaErrors(validateWorkflowRecord).join('; ')}`);
    return resultFor(workflowRecord, hardViolations, reviewReasons, resolutions);
  }
  if (!Array.isArray(skillRecords)) {
    hardViolations.push('Skill registry input must be an array');
    return resultFor(workflowRecord, hardViolations, reviewReasons, resolutions);
  }

  const requiredSkills = workflowRecord.skills.filter((skill) => skill.required);
  const requiredSkillIds = new Set();
  for (const requirement of requiredSkills) {
    if (requiredSkillIds.has(requirement.skill_id)) {
      hardViolations.push(`workflow declares required Skill more than once: ${requirement.skill_id}`);
      continue;
    }
    requiredSkillIds.add(requirement.skill_id);

    const candidates = skillRecords.filter((record) => record && record.skill_id === requirement.skill_id);
    if (!candidates.length) {
      hardViolations.push(`missing required Skill: ${requirement.skill_id}`);
      resolutions.push({skill_id: requirement.skill_id, resolution: 'HALT', reason: 'missing'});
      continue;
    }

    const invalidCandidate = candidates.find((record) => !validateSkillRecord(record));
    if (invalidCandidate) {
      hardViolations.push(`malformed SkillRecord for ${requirement.skill_id}: ${schemaErrors(validateSkillRecord).join('; ')}`);
      resolutions.push({skill_id: requirement.skill_id, resolution: 'HALT', reason: 'malformed'});
      continue;
    }

    const activeCandidates = candidates.filter((record) => ACTIVE_STATUSES.has(record.lifecycle_status));
    if (activeCandidates.length > 1) {
      hardViolations.push(`ambiguous active Skill records for ${requirement.skill_id}`);
      resolutions.push({skill_id: requirement.skill_id, resolution: 'HALT', reason: 'ambiguous'});
      continue;
    }
    if (!activeCandidates.length) {
      const status = candidates.map((record) => record.lifecycle_status).join(', ');
      hardViolations.push(`required Skill ${requirement.skill_id} is unavailable: ${status}`);
      resolutions.push({skill_id: requirement.skill_id, resolution: 'HALT', reason: 'unavailable'});
      continue;
    }

    const record = activeCandidates[0];
    const compatible = record.workflow_compatibility.some((entry) =>
      entry.workflow_key === workflowRecord.workflow_key && entry.workflow_version === workflowRecord.version
    );
    if (!compatible) {
      hardViolations.push(`Skill ${requirement.skill_id} is incompatible with ${workflowRecord.workflow_key}@${workflowRecord.version}`);
      resolutions.push({skill_id: requirement.skill_id, skill_record_id: record.skill_record_id, resolution: 'HALT', reason: 'incompatible'});
      continue;
    }

    const violations = capabilityViolations(workflowRecord, record);
    if (violations.length) {
      hardViolations.push(...violations);
      resolutions.push({skill_id: requirement.skill_id, skill_record_id: record.skill_record_id, resolution: 'HALT', reason: 'authority_exceeded'});
      continue;
    }

    if (record.lifecycle_status === 'available' && record.approval.status === 'approved') {
      resolutions.push({skill_id: requirement.skill_id, skill_record_id: record.skill_record_id, resolution: 'ALLOW'});
      continue;
    }

    reviewReasons.push(`Skill ${requirement.skill_id} is ${record.lifecycle_status} or pending approval`);
    resolutions.push({skill_id: requirement.skill_id, skill_record_id: record.skill_record_id, resolution: 'REVIEW'});
  }

  return resultFor(workflowRecord, hardViolations, reviewReasons, resolutions);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const [workflowPath, skillsPath] = process.argv.slice(2);
  if (!workflowPath || !skillsPath) {
    console.error('Usage: skill-compatibility.js <workflow-record.json> <skill-records.json>');
    process.exit(64);
  }
  try {
    const result = evaluate(readJson(workflowPath), readJson(skillsPath));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.computed_gate === 'ALLOW' ? 0 : result.computed_gate === 'REVIEW' ? 1 : 2);
  } catch (err) {
    process.stdout.write(`${JSON.stringify({computed_gate: 'HALT', compatibility_verdict: 'FAIL', hard_violations: [`invalid CLI input: ${err.message}`]}, null, 2)}\n`);
    process.exit(2);
  }
}

module.exports = {evaluate};
