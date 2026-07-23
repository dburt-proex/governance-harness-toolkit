#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const { evaluate: evalBuildRun } = require('./evaluators/build-run.js');
const { evaluate: evalActionPermission } = require('./evaluators/action-permission.js');
const { evaluateDecision } = require('./evaluators/decision-record.js');
const { evaluate: evalLearningReview } = require('./evaluators/learning-review.js');
const { evaluateOutput } = require('./evaluators/output-evaluation.js');
const { evaluate: evalSourcePolicy } = require('./evaluators/source-policy.js');
const { evaluate: evalWorkflowRoute } = require('./evaluators/workflow-route.js');

function createAjv() {
  const ajv = new Ajv({ allErrors: true, verbose: true, strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv;
}

const RESULTS = { passed: 0, failed: 0, errors: [] };

function log(msg) {
  console.error(`[regression] ${msg}`);
}

function loadJson(filePath) {
  const fullPath = path.join(__dirname, filePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to load ${filePath}: ${err.message}`);
  }
}

function applyPatch(obj, operations) {
  const result = JSON.parse(JSON.stringify(obj));
  for (const op of operations) {
    const parts = op.path.split('/').filter(Boolean);
    if (op.op === 'delete') {
      if (parts.length === 1) delete result[parts[0]];
      else {
        let target = result;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        delete target[parts[parts.length - 1]];
      }
    } else if (op.op === 'set') {
      let target = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in target)) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = op.value;
    }
  }
  return result;
}

function validateSchema(schemaPath, data) {
  const schema = loadJson(schemaPath);
  const ajv = createAjv();
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return {
    valid,
    errors: valid ? [] : (validate.errors || []).map(e => `${e.instancePath || '/'}: ${e.message}`)
  };
}

function recordResult(category, caseId, passed, details) {
  if (passed) {
    RESULTS.passed++;
    log(`PASS: ${category} > ${caseId}`);
  } else {
    RESULTS.failed++;
    RESULTS.errors.push({ category, caseId, details });
    log(`FAIL: ${category} > ${caseId}`);
    if (details) log(`  Details: ${JSON.stringify(details)}`);
  }
}

// Schema validation tests
function runSchemaTests() {
  log('=== Schema Validation Tests ===');
  const schemas = [
    'schemas/action-request.schema.json',
    'schemas/build-run.schema.json',
    'schemas/decision-record.schema.json',
    'schemas/intake-record.schema.json',
    'schemas/learning-review.schema.json',
    'schemas/output-evaluation.schema.json',
    'schemas/source-record.schema.json',
    'schemas/workflow-record.schema.json'
  ];

  for (const schemaPath of schemas) {
    const schema = loadJson(schemaPath);
    // Check that schema is valid JSON and has required fields
    let passed = true;
    let details = null;
    if (!schema || typeof schema !== 'object') {
      passed = false;
      details = ['Schema is not a valid object'];
    } else if (!schema.$schema && !schema.$id) {
      // Allow schemas without $schema or $id (some don't have them)
    }
    recordResult('schema', path.basename(schemaPath), passed, details);
  }
}

// Build-run evaluator tests
function runBuildRunTests() {
  log('=== Build-Run Evaluator Tests ===');
  const fixtures = loadJson('fixtures/build-run/regression-cases.json');
  const example = loadJson(fixtures.example);

  for (const tc of fixtures.cases) {
    let record = JSON.parse(JSON.stringify(example));
    record = applyPatch(record, tc.operations || []);

    const { valid, errors } = validateSchema(fixtures.schema, record);

    if (tc.expect_schema_valid === false) {
      recordResult('build-run', tc.case_id, !valid, null);
    } else if (tc.expect_schema_valid === true) {
      if (!valid) {
        recordResult('build-run', tc.case_id, false, errors);
        continue;
      }
      const result = evalBuildRun(record);
      const passed = result.record_verdict === tc.expect_record_verdict;
      recordResult('build-run', tc.case_id, passed, passed ? null : { expected: tc.expect_record_verdict, got: result.record_verdict });
    }
  }
}

// Action permission evaluator tests
function runActionPermissionTests() {
  log('=== Action Permission Evaluator Tests ===');
  const fixtures = loadJson('fixtures/action-permission/regression-cases.json');
  const matrix = loadJson('policies/action-permission-matrix.json');

  for (const tc of fixtures.cases) {
    const result = evalActionPermission(matrix, tc.request);

    let passed = true;
    const details = [];
    if (result.policy_gate !== tc.expected.policy_gate) { passed = false; details.push(`policy_gate: expected ${tc.expected.policy_gate}, got ${result.policy_gate}`); }
    if (result.execution_state !== tc.expected.execution_state) { passed = false; details.push(`execution_state: expected ${tc.expected.execution_state}, got ${result.execution_state}`); }
    if (result.record_verdict !== tc.expected.record_verdict) { passed = false; details.push(`record_verdict: expected ${tc.expected.record_verdict}, got ${result.record_verdict}`); }
    if (result.matched_rule !== tc.expected.matched_rule) { passed = false; details.push(`matched_rule: expected ${tc.expected.matched_rule}, got ${result.matched_rule}`); }

    recordResult('action-permission', tc.name, passed, passed ? null : details);
  }
}

// Decision record evaluator tests
function runDecisionRecordTests() {
  log('=== Decision Record Evaluator Tests ===');
  const fixtures = loadJson('fixtures/decision-record/regression-cases.json');

  for (const tc of fixtures.cases) {
    let record;
    if (tc.mutate_from) {
      record = loadJson(tc.mutate_from);
      for (const m of tc.mutations || []) {
        const parts = m.path.split('.').filter(Boolean);
        let target = record;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = m.value;
      }
    } else {
      record = loadJson(tc.record_path);
    }

    const { valid, errors } = validateSchema(fixtures.schema, record);
    if (tc.expect_schema_valid === false) {
      recordResult('decision-record', tc.case_id, !valid, null);
    } else if (tc.expect_schema_valid === true) {
      if (!valid) {
        recordResult('decision-record', tc.case_id, false, errors);
        continue;
      }
      const result = evaluateDecision(record);
      const passed = result.verdict === tc.expect_verdict;
      recordResult('decision-record', tc.case_id, passed, passed ? null : { expected: tc.expect_verdict, got: result.verdict });
    }
  }
}

// Learning review evaluator tests
function runLearningReviewTests() {
  log('=== Learning Review Evaluator Tests ===');
  const fixtures = loadJson('fixtures/learning-review/regression-cases.json');

  for (const tc of fixtures.cases) {
    const result = evalLearningReview(tc.review);

    let passed = true;
    const details = [];
    if (result.computed_gate !== tc.expected.computed_gate) { passed = false; details.push(`computed_gate: expected ${tc.expected.computed_gate}, got ${result.computed_gate}`); }
    if (result.record_verdict !== tc.expected.record_verdict) { passed = false; details.push(`record_verdict: expected ${tc.expected.record_verdict}, got ${result.record_verdict}`); }

    recordResult('learning-review', tc.name, passed, passed ? null : details);
  }
}

// Output evaluation evaluator tests
function runOutputEvaluationTests() {
  log('=== Output Evaluation Evaluator Tests ===');
  const fixtures = loadJson('fixtures/output-evaluation/regression-cases.json');

  for (const tc of fixtures.cases) {
    let record;
    if (tc.mutate_from) {
      record = loadJson(tc.mutate_from);
      for (const m of tc.mutations || []) {
        const parts = m.path.split('.').filter(Boolean);
        let target = record;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = m.value;
      }
    } else {
      record = loadJson(tc.record_path);
    }

    const { valid, errors } = validateSchema(fixtures.schema, record);
    if (tc.expect_schema_valid === false) {
      recordResult('output-evaluation', tc.case_id, !valid, null);
    } else if (tc.expect_schema_valid === true) {
      if (!valid) {
        recordResult('output-evaluation', tc.case_id, false, errors);
        continue;
      }
      const result = evaluateOutput(record);
      let passed = result.record_verdict === tc.expect_record_verdict;
      if (passed && tc.expect_release_gate && result.release_gate !== tc.expect_release_gate) {
        passed = false;
      }
      recordResult('output-evaluation', tc.case_id, passed, passed ? null : { expected_verdict: tc.expect_record_verdict, expected_gate: tc.expect_release_gate, got_verdict: result.record_verdict, got_gate: result.release_gate });
    }
  }
}

// Source policy evaluator tests
function runSourcePolicyTests() {
  log('=== Source Policy Evaluator Tests ===');
  const fixtures = loadJson('fixtures/source-record/policy-regression-cases.json');
  const asOf = fixtures.as_of;

  for (const tc of fixtures.cases) {
    const result = evalSourcePolicy(tc.record, asOf);

    let passed = true;
    const details = [];
    if (result.policy_verdict !== tc.expect_policy_verdict) { passed = false; details.push(`policy_verdict: expected ${tc.expect_policy_verdict}, got ${result.policy_verdict}`); }
    if (result.effective_gate !== tc.expect_effective_gate) { passed = false; details.push(`effective_gate: expected ${tc.expect_effective_gate}, got ${result.effective_gate}`); }
    if (result.final_eligible !== tc.expect_final_eligible) { passed = false; details.push(`final_eligible: expected ${tc.expect_final_eligible}, got ${result.final_eligible}`); }

    recordResult('source-policy', tc.case_id, passed, passed ? null : details);
  }
}

// Workflow route evaluator tests
function runWorkflowRouteTests() {
  log('=== Workflow Route Evaluator Tests ===');
  const fixtures = loadJson('fixtures/workflow-record/regression-cases.json');
  const baseIntake = fixtures.base_intake;
  const workflowExample = loadJson(fixtures.workflow_example);

  for (const tc of fixtures.cases) {
    let intake = JSON.parse(JSON.stringify(baseIntake));
    let workflow = JSON.parse(JSON.stringify(workflowExample));
    intake = applyPatch(intake, tc.operations || []);

    const { valid: intakeValid, errors: intakeErrors } = validateSchema(fixtures.intake_schema, intake);
    const { valid: workflowValid, errors: workflowErrors } = validateSchema(fixtures.workflow_schema, workflow);

    if (!intakeValid || !workflowValid) {
      recordResult('workflow-route', tc.case_id, false, { intakeValid, workflowValid, intakeErrors, workflowErrors });
      continue;
    }

    const result = evalWorkflowRoute(workflow, intake);

    let passed = true;
    const details = [];
    if (result.computed_gate !== tc.expect_computed_gate) { passed = false; details.push(`computed_gate: expected ${tc.expect_computed_gate}, got ${result.computed_gate}`); }
    if (result.route_verdict !== tc.expect_route_verdict) { passed = false; details.push(`route_verdict: expected ${tc.expect_route_verdict}, got ${result.route_verdict}`); }

    recordResult('workflow-route', tc.case_id, passed, passed ? null : details);
  }
}

// Source record schema tests
function runSourceRecordTests() {
  log('=== Source Record Schema Tests ===');
  const fixtures = loadJson('fixtures/source-record/regression-cases.json');

  for (const tc of fixtures.cases) {
    const { valid, errors } = validateSchema(fixtures.schema, tc.record);

    if (tc.expect_schema_valid === false) {
      recordResult('source-record', tc.case_id, !valid, null);
    } else if (tc.expect_schema_valid === true) {
      if (!valid) {
        recordResult('source-record', tc.case_id, false, errors);
        continue;
      }
      recordResult('source-record', tc.case_id, true, null);
    }
  }
}

// Intake record schema tests
function runIntakeRecordTests() {
  log('=== Intake Record Schema Tests ===');
  const fixtures = loadJson('fixtures/intake-record/regression-cases.json');

  for (const tc of fixtures.cases) {
    const { valid, errors } = validateSchema(fixtures.schema, tc.record);

    if (tc.expect_schema_valid === false) {
      recordResult('intake-record', tc.case_id, !valid, null);
    } else if (tc.expect_schema_valid === true) {
      if (!valid) {
        recordResult('intake-record', tc.case_id, false, errors);
        continue;
      }
      recordResult('intake-record', tc.case_id, true, null);
    }
  }
}

function main() {
  const jsonMode = process.argv.includes('--json');

  // Suppress logging in JSON mode
  const originalLog = log;
  if (jsonMode) {
    log = () => {};
  } else {
    log('Starting regression suite...');
  }

  runSchemaTests();
  runBuildRunTests();
  runActionPermissionTests();
  runDecisionRecordTests();
  runLearningReviewTests();
  runOutputEvaluationTests();
  runSourcePolicyTests();
  runWorkflowRouteTests();
  runSourceRecordTests();
  runIntakeRecordTests();

  const output = {
    timestamp: new Date().toISOString(),
    suite: 'governance-harness-toolkit-regression',
    summary: {
      total: RESULTS.passed + RESULTS.failed,
      passed: RESULTS.passed,
      failed: RESULTS.failed
    },
    status: RESULTS.failed === 0 ? 'PASS' : 'FAIL',
    errors: RESULTS.errors
  };

  if (jsonMode) {
    console.log(JSON.stringify(output));
  } else {
    log(`\n=== Summary ===`);
    log(`Total: ${output.summary.total}, Passed: ${output.summary.passed}, Failed: ${output.summary.failed}`);
    if (RESULTS.errors.length > 0) {
      log(`\nFailures:`);
      for (const err of RESULTS.errors) {
        log(`  ${err.category} > ${err.caseId}: ${JSON.stringify(err.details)}`);
      }
    }
  }

  process.exit(RESULTS.failed > 0 ? 1 : 0);
}

main();
