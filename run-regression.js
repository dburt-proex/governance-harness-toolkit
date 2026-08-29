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
const { evaluate: evalPostMergeReconciliation } = require('./evaluators/post-merge-reconciliation.js');
const { evaluate: evalSourcePolicy } = require('./evaluators/source-policy.js');
const { evaluate: evalWorkflowRoute } = require('./evaluators/workflow-route.js');
const {
  evaluate: evalWorkflowExecutionTrust,
  validatePolicy: validateWorkflowExecutionTrustPolicy,
  FULL_COMMIT_SHA
} = require('./evaluators/workflow-execution-trust.js');

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
    'schemas/skill-record.schema.json',
    'schemas/source-record.schema.json',
    'schemas/workflow-execution-trust.schema.json',
    'schemas/workflow-record.schema.json'
  ];

  for (const schemaPath of schemas) {
    const schema = loadJson(schemaPath);
    let passed = true;
    let details = null;
    if (!schema || typeof schema !== 'object') {
      passed = false;
      details = ['Schema is not a valid object'];
    } else {
      try {
        createAjv().compile(schema);
      } catch (err) {
        passed = false;
        details = [err.message];
      }
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

// Post-merge reconciliation evaluator tests
function runPostMergeReconciliationTests() {
  log('=== Post-Merge Reconciliation Evaluator Tests ===');
  const fixtures = loadJson('fixtures/post-merge-reconciliation/regression-cases.json');

  for (const tc of fixtures.cases) {
    const result = evalPostMergeReconciliation(tc);
    const passed = result.computed_gate === tc.expected.computed_gate &&
      result.record_verdict === tc.expected.record_verdict &&
      result.mismatches.length === tc.expected.mismatch_count &&
      result.blockers.length === tc.expected.blocker_count;
    recordResult('post-merge-reconciliation', tc.case_id, passed, passed ? null : { expected: tc.expected, got: result });
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

// Skill registry compatibility evaluator tests
function runSkillCompatibilityTests() {
  log('=== Skill Compatibility Evaluator Tests ===');

  let evalSkillCompatibility;
  try {
    ({ evaluate: evalSkillCompatibility } = require('./evaluators/skill-compatibility.js'));
  } catch (err) {
    recordResult('skill-compatibility', 'evaluator-available', false, [err.message]);
    return;
  }

  const fixtures = loadJson('fixtures/skill-record/regression-cases.json');
  const workflow = loadJson(fixtures.workflow_example);
  const canonicalRecords = loadJson(fixtures.registry_example);

  for (const tc of fixtures.cases) {
    let skillRecords = JSON.parse(JSON.stringify(canonicalRecords));
    if (tc.exclude_skill_ids) {
      skillRecords = skillRecords.filter((record) => !tc.exclude_skill_ids.includes(record.skill_id));
    }
    skillRecords = applyPatch(skillRecords, tc.operations || []);
    if (tc.duplicate_skill_id) {
      const duplicate = skillRecords.find((record) => record.skill_id === tc.duplicate_skill_id);
      if (duplicate) skillRecords.push(JSON.parse(JSON.stringify(duplicate)));
    }

    const validations = skillRecords.map((record) => validateSchema(fixtures.schema, record));
    const schemaValid = validations.every((result) => result.valid);
    if (tc.expect_schema_valid === false) {
      recordResult('skill-record', tc.case_id, !schemaValid, schemaValid ? ['schema unexpectedly accepted every record'] : null);
      continue;
    }
    if (!schemaValid) {
      recordResult('skill-compatibility', tc.case_id, false, validations.flatMap((result) => result.errors));
      continue;
    }

    const result = evalSkillCompatibility(workflow, skillRecords);
    const passed = result.computed_gate === tc.expect_computed_gate;
    recordResult('skill-compatibility', tc.case_id, passed, passed ? null : {
      expected: tc.expect_computed_gate,
      got: result.computed_gate,
      result
    });
  }
}

// Workflow execution and input trust tests
function runWorkflowExecutionTrustTests() {
  log('=== Workflow Execution and Input Trust Tests ===');
  const fixtures = loadJson('fixtures/workflow-execution-trust/regression-cases.json');
  const policy = loadJson(fixtures.policy);
  const policyErrors = validateWorkflowExecutionTrustPolicy(policy);
  recordResult('workflow-execution-trust', 'canonical-policy-invariants', policyErrors.length === 0, policyErrors);

  const weakenedMergePolicy = JSON.parse(JSON.stringify(policy));
  weakenedMergePolicy.authorities.find((item) => item.authority === 'merge').approval = 'policy';
  const weakenedMergeResult = evalWorkflowExecutionTrust(weakenedMergePolicy, fixtures.base_request);
  const weakenedMergeFailsClosed = weakenedMergeResult.computed_gate === 'HALT' &&
    weakenedMergeResult.conformance_verdict === 'FAIL' &&
    weakenedMergeResult.findings.some((finding) => finding.code === 'invalid_policy');
  recordResult(
    'workflow-execution-trust',
    'weakened-merge-approval-policy-fails-closed',
    weakenedMergeFailsClosed,
    weakenedMergeFailsClosed ? null : weakenedMergeResult
  );

  const duplicateAuthorityPolicy = JSON.parse(JSON.stringify(policy));
  duplicateAuthorityPolicy.authorities.push(JSON.parse(JSON.stringify(
    duplicateAuthorityPolicy.authorities.find((item) => item.authority === 'merge')
  )));
  const duplicateAuthorityErrors = validateWorkflowExecutionTrustPolicy(duplicateAuthorityPolicy);
  const duplicateAuthorityRejected = duplicateAuthorityErrors.includes('authority definitions must be unique');
  recordResult(
    'workflow-execution-trust',
    'duplicate-authority-policy-is-invalid',
    duplicateAuthorityRejected,
    duplicateAuthorityRejected ? null : duplicateAuthorityErrors
  );

  const selfAuthorizingInputPolicy = JSON.parse(JSON.stringify(policy));
  selfAuthorizingInputPolicy.input_trust_classes.find((item) => item.class === 'pull_request_body').may_authorize = true;
  const selfAuthorizingInputErrors = validateWorkflowExecutionTrustPolicy(selfAuthorizingInputPolicy);
  const selfAuthorizingInputRejected = selfAuthorizingInputErrors.includes('pull_request_body.may_authorize must be false');
  recordResult(
    'workflow-execution-trust',
    'self-authorizing-input-policy-is-invalid',
    selfAuthorizingInputRejected,
    selfAuthorizingInputRejected ? null : selfAuthorizingInputErrors
  );

  const diffwallConfig = fs.readFileSync(path.join(__dirname, 'rules/default.yml'), 'utf8');
  const configProtected = [
    '".github/agents/**"',
    '"CLAUDE.md"',
    '"AGENTS.md"',
    '"policies/**"',
    '"schemas/**"'
  ].every((entry) => diffwallConfig.includes(entry)) && !diffwallConfig.includes('- "*.md"');
  recordResult(
    'workflow-execution-trust',
    'repository-diffwall-policy-protects-governance-inputs',
    configProtected,
    configProtected ? null : ['rules/default.yml does not protect every required governance input or still ignores all root Markdown']
  );

  const diffwallWorkflow = fs.readFileSync(path.join(__dirname, '.github/workflows/diffwall.yml'), 'utf8');
  const workflowLoadsPolicy = diffwallWorkflow.includes('config: rules/default.yml');
  recordResult(
    'workflow-execution-trust',
    'diffwall-workflow-loads-repository-policy',
    workflowLoadsPolicy,
    workflowLoadsPolicy ? null : ['DiffWall workflow does not load rules/default.yml']
  );

  const ciWorkflow = fs.readFileSync(path.join(__dirname, '.github/workflows/ci.yml'), 'utf8');
  const workflowsCheckoutExactHead =
    diffwallWorkflow.includes('ref: ${{ github.event.pull_request.head.sha }}') &&
    ciWorkflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}');
  recordResult(
    'workflow-execution-trust',
    'pull-request-workflows-checkout-exact-head-sha',
    workflowsCheckoutExactHead,
    workflowsCheckoutExactHead ? null : ['PR workflows do not explicitly checkout the immutable event head SHA']
  );

  const workflowDirectory = path.join(__dirname, '.github/workflows');
  const unpinnedActions = [];
  for (const fileName of fs.readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/.test(name))) {
    const raw = fs.readFileSync(path.join(workflowDirectory, fileName), 'utf8');
    for (const match of raw.matchAll(/uses:\s*([^\s#]+)/g)) {
      const spec = match[1];
      if (spec.startsWith('./')) continue;
      const separator = spec.lastIndexOf('@');
      const ref = separator === -1 ? '' : spec.slice(separator + 1);
      if (!FULL_COMMIT_SHA.test(ref)) unpinnedActions.push(`${fileName}: ${spec}`);
    }
  }
  recordResult(
    'workflow-execution-trust',
    'repository-third-party-actions-use-immutable-shas',
    unpinnedActions.length === 0,
    unpinnedActions
  );

  for (const tc of fixtures.cases) {
    let request = JSON.parse(JSON.stringify(fixtures.base_request));
    request = applyPatch(request, tc.operations || []);
    const { valid, errors } = validateSchema(fixtures.schema, request);

    if (tc.expect_schema_valid === false) {
      recordResult('workflow-execution-trust', tc.case_id, !valid, valid ? ['schema unexpectedly accepted the request'] : null);
      continue;
    }
    if (!valid) {
      recordResult('workflow-execution-trust', tc.case_id, false, errors);
      continue;
    }

    const result = evalWorkflowExecutionTrust(policy, request);
    let passed = result.computed_gate === tc.expect_computed_gate &&
      result.conformance_verdict === tc.expect_conformance_verdict;
    if (passed && tc.expect_finding) {
      passed = result.findings.some((finding) => finding.code === tc.expect_finding);
    }
    recordResult('workflow-execution-trust', tc.case_id, passed, passed ? null : {
      expected_gate: tc.expect_computed_gate,
      expected_verdict: tc.expect_conformance_verdict,
      expected_finding: tc.expect_finding,
      got: result
    });
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
  runPostMergeReconciliationTests();
  runOutputEvaluationTests();
  runSourcePolicyTests();
  runWorkflowRouteTests();
  runSkillCompatibilityTests();
  runWorkflowExecutionTrustTests();
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
