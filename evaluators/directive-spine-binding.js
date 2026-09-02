#!/usr/bin/env node
'use strict';

const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const directiveSpineSchema = require('../schemas/directive-spine.schema.json');
const skillRecordSchema = require('../schemas/skill-record.schema.json');

const REVIEWABLE_STATUSES = new Set(['proposed', 'deprecated']);

function createValidator(schema) {
  const ajv = new Ajv({allErrors: true, strict: false, validateSchema: false});
  addFormats(ajv);
  return ajv.compile(schema);
}

const validateDirectiveSpine = createValidator(directiveSpineSchema);
const validateSkillRecord = createValidator(skillRecordSchema);

function schemaErrors(validate) {
  return (validate.errors || []).map((error) => `${error.instancePath || '/'}: ${error.message}`);
}

function resultFor(directiveSpine, hardViolations, reviewReasons, resolvedSkillRecordId = null) {
  const bindingGate = hardViolations.length ? 'HALT' : reviewReasons.length ? 'REVIEW' : 'ALLOW';
  return {
    directive_spine_id: directiveSpine && directiveSpine.directive_spine_id ? directiveSpine.directive_spine_id : null,
    correlation_id: directiveSpine && directiveSpine.correlation_id ? directiveSpine.correlation_id : null,
    binding_gate: bindingGate,
    binding_verdict: bindingGate === 'ALLOW' ? 'PASS' : bindingGate === 'REVIEW' ? 'REVIEW' : 'FAIL',
    resolved_skill_record_id: resolvedSkillRecordId,
    hard_violations: hardViolations,
    review_reasons: reviewReasons
  };
}

function evaluate(directiveSpine, skillRecords) {
  const hardViolations = [];
  const reviewReasons = [];

  if (!validateDirectiveSpine(directiveSpine)) {
    hardViolations.push(`Directive Spine record is malformed: ${schemaErrors(validateDirectiveSpine).join('; ')}`);
    return resultFor(directiveSpine, hardViolations, reviewReasons);
  }
  if (!Array.isArray(skillRecords)) {
    hardViolations.push('Skill registry input must be an array');
    return resultFor(directiveSpine, hardViolations, reviewReasons);
  }

  for (const record of skillRecords) {
    if (!validateSkillRecord(record)) {
      hardViolations.push(`Skill registry contains a malformed record: ${schemaErrors(validateSkillRecord).join('; ')}`);
      return resultFor(directiveSpine, hardViolations, reviewReasons);
    }
  }

  const binding = directiveSpine.skill_binding;
  const candidates = skillRecords.filter((record) => record.skill_record_id === binding.skill_record_id);
  if (!candidates.length) {
    hardViolations.push(`Bound SkillRecord is missing: ${binding.skill_record_id}`);
    return resultFor(directiveSpine, hardViolations, reviewReasons);
  }
  if (candidates.length > 1) {
    hardViolations.push(`Bound SkillRecord is ambiguous: ${binding.skill_record_id}`);
    return resultFor(directiveSpine, hardViolations, reviewReasons);
  }

  const record = candidates[0];
  const identityMismatches = [];
  if (record.skill_id !== binding.skill_id) identityMismatches.push('skill_id');
  if (record.version !== binding.version) identityMismatches.push('version');
  if (record.definition.content_sha256 !== binding.definition_sha256) identityMismatches.push('definition_sha256');
  if (identityMismatches.length) {
    hardViolations.push(`Bound SkillRecord does not match immutable binding: ${identityMismatches.join(', ')}`);
    return resultFor(directiveSpine, hardViolations, reviewReasons, record.skill_record_id);
  }

  if (record.lifecycle_status === 'available' && record.approval.status === 'approved') {
    return resultFor(directiveSpine, hardViolations, reviewReasons, record.skill_record_id);
  }
  if (REVIEWABLE_STATUSES.has(record.lifecycle_status)) {
    reviewReasons.push(`Bound SkillRecord is ${record.lifecycle_status} or pending approval`);
    return resultFor(directiveSpine, hardViolations, reviewReasons, record.skill_record_id);
  }

  hardViolations.push(`Bound SkillRecord is unavailable: ${record.lifecycle_status}`);
  return resultFor(directiveSpine, hardViolations, reviewReasons, record.skill_record_id);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const [directiveSpinePath, skillRecordsPath] = process.argv.slice(2);
  if (!directiveSpinePath || !skillRecordsPath) {
    console.error('Usage: directive-spine-binding.js <directive-spine.json> <skill-records.json>');
    process.exit(64);
  }
  try {
    const result = evaluate(readJson(directiveSpinePath), readJson(skillRecordsPath));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.binding_gate === 'ALLOW' ? 0 : result.binding_gate === 'REVIEW' ? 1 : 2);
  } catch (err) {
    process.stdout.write(`${JSON.stringify({binding_gate: 'HALT', binding_verdict: 'FAIL', hard_violations: [`invalid CLI input: ${err.message}`]}, null, 2)}\n`);
    process.exit(2);
  }
}

module.exports = {evaluate};
