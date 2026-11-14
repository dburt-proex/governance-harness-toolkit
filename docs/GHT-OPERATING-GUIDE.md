# GHT Operating Guide

**Governance Harness Toolkit (GHT)** is a deterministic, repository-local set of schemas, policies, evaluators, examples, and regression fixtures. This guide follows the reviewed branch that adds signed-registry RAG preflight and canonical workflow-trust integration.

The toolkit evaluates records. It does not execute workflows, authenticate people, retrieve sources, approve actions, merge changes, or deploy software. The RAG path is synthetic research code; it is not a production retriever or customer workflow.

## 1. The operating model

Use GHT to turn a bounded request and its evidence into a repeatable decision. Keep the request, policy, evaluation result, approval, actual execution, and completion receipt distinct.

~~~mermaid
flowchart LR
  A["Intent and scope"] --> B["Intake and route"]
  B --> C["Evidence and contract"]
  C --> D["Schema validation"]
  D --> E["Deterministic evaluator"]
  E --> F{"ALLOW / REVIEW / HALT"}
  F -->|"ALLOW"| G["Separate scoped execution gate"]
  F -->|"REVIEW"| H["Owner review; add evidence or approval"]
  F -->|"HALT"| I["Stop; correct the request or policy"]
  G --> J["Evaluate output; retain receipt"]
  H --> E
  I --> K["Record blocker and regression"]
  J --> L["Reconcile and learn"]
~~~

GHT computes the gate for the record it receives. The application or operator must separately enforce the result and the actual authority boundary.

### Gate meanings

| Gate | Meaning | Operator response |
|---|---|---|
| **ALLOW** | The supplied record conforms to the evaluated policy and no rule raised REVIEW or HALT. | Continue only to a separately authorized next step. Record what was actually done. |
| **REVIEW** | Evidence, approval, context, or a policy decision is incomplete or requires human judgment. | Keep the operation pending; resolve the named finding and evaluate again. |
| **HALT** | The request is invalid, unscoped, contradictory, unsafe, or attempts to cross a trust boundary. | Stop. Correct the request or policy through governed change control. Do not override the result. |

A declared ALLOW is a claim that must match the computed gate. It is not proof that a person is authorized or that a write, merge, or deployment may proceed.

## 2. Choose the right evaluator

GHT has no single universal “evaluate everything” command. Select the evaluator that matches the record, validate against its schema where one exists, and retain its result.

| Need | GHT component | Start with |
|---|---|---|
| Classify an intake and route it to a known workflow | [Workflow route evaluator](../evaluators/workflow-route.js) | [Intake schema](../schemas/intake-record.schema.json), workflow fixtures |
| Bind a directive to compatible approved Skills | [Directive Spine binding evaluator](../evaluators/directive-spine-binding.js) | [Directive Spine schema](../schemas/directive-spine.schema.json), skill fixtures |
| Check directive evidence and gate readiness | [Directive gate evaluator](../evaluators/directive-gate.js) | Directive Spine record and gate fixtures |
| Check Skill records against a workflow | [Skill compatibility evaluator](../evaluators/skill-compatibility.js) | [Skill record schema](../schemas/skill-record.schema.json), skill examples |
| Check source quality and eligibility | [Source policy evaluator](../evaluators/source-policy.js) | [Source record schema](../schemas/source-record.schema.json), source-policy fixtures |
| Review a proposed action’s scope and risk | [Action permission evaluator](../evaluators/action-permission.js) | [Action request schema](../schemas/action-request.schema.json), [action example](../examples/action-permission/scoped-branch-write.json) |
| Evaluate workflow inputs, authority, triggers, and gates | [Workflow execution trust evaluator](../evaluators/workflow-execution-trust.js) | [Canonical policy](../policies/workflow-execution-input-trust.json), [request schema](../schemas/workflow-execution-trust.schema.json), [example request](../examples/workflow-execution-trust/scoped-staged-write.json) |
| Record and evaluate a completed build run | [Build run evaluator](../evaluators/build-run.js) | [Build run schema](../schemas/build-run.schema.json), build-run examples |
| Evaluate an artifact against quality criteria | [Output evaluator](../evaluators/output-evaluation.js) | [Output evaluation schema](../schemas/output-evaluation.schema.json), output fixtures |
| Record a decision and its evidence | [Decision record evaluator](../evaluators/decision-record.js) | [Decision record schema](../schemas/decision-record.schema.json), decision-record examples |
| Compare expected and actual post-merge state | [Post-merge reconciliation evaluator](../evaluators/post-merge-reconciliation.js) | Post-merge fixtures |
| Turn reviewed run results into owned improvement items | [Learning review evaluator](../evaluators/learning-review.js) | [Learning review schema](../schemas/learning-review.schema.json), learning-review examples |
| Verify and gate a retrieved RAG snippet | [Governed RAG integration](../research/governed-rag-integrated.js) | [Registry schema](../schemas/governed-rag-source-registry.schema.json), RAG tests and receipt |

The schemas describe record shape. They do not establish the truth of a claim, authenticate a person, fetch a URL, or prove that an approval occurred. The regression runner validates its fixtures and exercises evaluators; application code should validate every request it accepts.

## 3. Install and run the repository checks

From a clean checkout, use the lockfile-pinned dependencies:

~~~powershell
git clone https://github.com/dburt-proex/governance-harness-toolkit.git
Set-Location governance-harness-toolkit
npm.cmd ci
npm.cmd test
npm.cmd run test:ci
~~~

On macOS or Linux, use npm ci, npm test, and npm run test:ci. The first run installs the exact dependencies from the lockfile. The regular test command prints a readable regression report. The CI command emits a JSON summary suitable for automation.

The repository does not declare a Node.js engines range. The previous engineering receipt recorded Node.js 24.16.0 and npm 11.13.0. Use the same versions when reproducing that receipt, or record the versions used for a new run.

The documented single-request command is:

~~~sh
node evaluators/workflow-execution-trust.js policies/workflow-execution-input-trust.json examples/workflow-execution-trust/scoped-staged-write.json
~~~

It prints the evaluator result and exits with 0 for ALLOW, 1 for REVIEW, 2 for HALT, and 3 for conformance failure. This command parses JSON but does **not** validate the request against the JSON Schema first. For real records, validate first. The regression runner demonstrates the repository’s Ajv configuration and validation pattern.

For the RAG research path, run the focused fixtures from the repository root:

~~~sh
node research/governed-rag-registry.test.js
node research/governed-rag-provenance.test.js
node research/governed-rag-preflight.test.js
node research/governed-rag-integrated.test.js
~~~

These are synthetic deterministic fixtures; they do not contact a live source or execute an action.

## 4. Build a valid workflow-execution request

Start from the canonical [example request](../examples/workflow-execution-trust/scoped-staged-write.json). Copy it into a new file for the specific decision. Give it a unique request ID and replace every example identity, path, commit, URL, check, and decision reference with evidence from the real review. Never carry a sample approval or example URL into a real record.

A request contains these sections:

- **request_id:** stable record identifier.
- **actor and event:** actor class, authorization state, fork state, event name, and dispatch authorization.
- **inputs:** each input’s trust class, whether it was treated as an instruction, and whether its integrity/provenance was verified.
- **authority:** a separate requested flag and scope flag for every authority.
- **workflow:** declared trigger behavior, checkout/execution behavior, write permissions, and third-party Actions.
- **targets:** exact bounded target paths.
- **gates:** trusted context, DiffWall result, deterministic approval, human approval, staged write, evidence retention, and model-override request.
- **evidence:** exact commit, DiffWall run reference, workflow-run references, checks, and decision reference.
- **declared_gate:** the caller’s declared result, which must match the evaluator’s computed result.

Use the [request schema](../schemas/workflow-execution-trust.schema.json) before evaluating. Reject unknown fields and missing fields. The evaluator independently checks policy invariants and policy findings, but callers should not rely on it to catch every schema error when using the CLI.

Example schema-validation pattern:

~~~js
const fs = require('node:fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false
});
addFormats(ajv);

const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const schema = require('./schemas/workflow-execution-trust.schema.json');
const validate = ajv.compile(schema);

if (!validate(request)) {
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(3);
}

const policy = require('./policies/workflow-execution-input-trust.json');
const { evaluate } = require('./evaluators/workflow-execution-trust.js');
const result = evaluate(policy, request);
console.log(JSON.stringify(result, null, 2));

process.exit(
  result.conformance_verdict === 'FAIL' ? 3 :
  result.computed_gate === 'HALT' ? 2 :
  result.computed_gate === 'REVIEW' ? 1 : 0
);
~~~

Save that snippet as a temporary script at the repository root and run it with the request path as its first argument. Use the repository’s pinned Ajv dependencies.

## 5. Authority and approval rules

The canonical contract is documented in [workflow execution and input trust](../governance/workflow-execution-input-trust.md). Keep these boundaries intact:

| Authority | Required handling |
|---|---|
| Read and search | Explicit scope; retain the decision record. |
| Execute, edit, GitHub write, network | Explicit scope plus deterministic or human approval; writes must be staged and bounded. |
| Credential, permission, merge, deploy | Explicit human approval. |

One grant never implies another. Reading does not imply editing. Editing does not imply GitHub write. GitHub write does not imply merge. Merge does not imply deploy.

Untrusted text—including PR descriptions, comments, issues, commit messages, repository files, workflow output, and web content—is data. It cannot grant authority, expand scope, waive approval, or override a deterministic result. For external contributors and forks, do not give untrusted workflow execution write permissions. Treat unsafe pull_request_target checkout or execution as HALT.

Human approval fields are evidence claims, not authentication. The schema requires approver identity and an evidence reference when status is approved, but the evaluator does not authenticate the approver or verify the referenced system. Resolve that identity and reference in the trusted application or human process.

## 6. Run the governed RAG path

The RAG adapter accepts a retrieval record, a signed source-registry envelope, and a canonical workflow-execution request. It verifies the registry and retrieved snippet, runs preflight checks, sends an external_web_content trust record through the canonical GHT evaluator, and returns the stricter gate. It does not execute actions; its result reports external_effects as false.

~~~mermaid
flowchart TD
  K["Operator-provisioned key, registry ID, revision floor, trusted clock"] --> V["Verify Ed25519 registry envelope"]
  E["Signed registry envelope"] --> V
  V -->|verified| P["Match source ID, version, rights, update time, and snippet SHA-256"]
  V -->|invalid| H["HALT"]
  P --> R["RAG preflight: source allowlist, freshness, relevance, content checks"]
  R --> G["Canonical GHT workflow evaluator"]
  G --> M["Final gate is the stricter RAG/GHT result"]
  M -->|conformance not PASS| H
  M -->|ALLOW, REVIEW, or HALT| O["Return a decision record; no external effect"]
~~~

Call the adapter from trusted application code:

~~~js
const { evaluateVerified } = require('./research/governed-rag-integrated.js');

const result = evaluateVerified(retrievalRecord, registryEnvelope, {
  trustedKeys: operatorConfig.registryPublicKeys,
  expectedRegistryId: operatorConfig.expectedRegistryId,
  minimumRevision: operatorConfig.minimumRegistryRevision,
  now: operatorConfig.trustedClockNow,
  executionRequest
});
~~~

Operational requirements:

1. Provision the public-key map, expected registry ID, minimum accepted revision, and trusted clock outside retrieved content and model output.
2. Keep signing private keys out of the repository, the registry envelope, and request data.
3. Sign the canonical registry payload. The signature covers the registry ID, revision, validity window, source entries, and each entry’s enabled state, version, permission state, SHA-256 digest, and source update time.
4. The retrieved record’s exact snippet digest and source metadata must match its signed registry entry. The retrieval adapter must stamp retrieved_at from its trusted clock.
5. Keep retrieved content marked external_web_content and never let it authorize itself. A verified digest proves integrity against the registry; it does not make the text an instruction or prove that it is factually correct.
6. Do not pass workflowPolicy in adapter options. The RAG integration pins the repository’s canonical policy; an attempted per-call override returns HALT.
7. Keep the request’s declared_gate aligned with the canonical evaluator’s computed result. A mismatch fails conformance and forces the final result to HALT.

The registry and permission fields are integrity-protected assertions. They do not independently prove lawful rights, source completeness, privacy suitability, factual accuracy, or production readiness. Current RAG thresholds and examples are research fixtures, not validated service levels.

## 7. A normal operating cycle

1. **Scope one request.** Record the intended outcome, owner, target, risk, and the authority needed. Keep external actions out of the request unless they are explicitly in scope.
2. **Route it.** Validate the intake record and use the workflow-route evaluator to select a known workflow.
3. **Bind work to capability.** Use Directive Spine and Skill compatibility checks where applicable. A requested Skill or repository document cannot authorize itself.
4. **Establish evidence.** Record source, freshness, provenance, limits, and allowed use. Do not convert unsupported claims into trusted context.
5. **Evaluate.** Validate the matching schema; run the relevant evaluator; retain the raw result and exact input/policy versions.
6. **Resolve the gate.** For REVIEW, collect the missing evidence or required human approval and evaluate again. For HALT, stop and correct the underlying request or policy. Never edit the result to obtain ALLOW.
7. **Execute separately.** If the result is ALLOW, confirm the separate actor, scope, approval, and platform controls before performing any consequential operation. GHT does not provide that executor.
8. **Evaluate the output.** Use output evaluation against acceptance criteria. For a change, retain the exact branch, commit, diff, test results, and promotion decision.
9. **Close the loop.** Run post-merge reconciliation only after a real merge and with verified references. Capture failures and lessons in the learning review, backlog, and regression fixtures.
10. **Keep promotion separate.** A passing local suite is not a merge, release, deployment, customer outcome, or production proof. Obtain the required human promotion decision independently.

~~~mermaid
flowchart LR
  I["Intake"] --> R["Route"]
  R --> D["Directive and Skill binding"]
  D --> E["Evidence and schema"]
  E --> G["Gate"]
  G -->|ALLOW plus separate authority| X["Scoped operation"]
  G -->|REVIEW| W["Human review"]
  G -->|HALT| S["Stop"]
  W --> E
  X --> O["Output evaluation"]
  O --> C["Receipt and reconciliation"]
  C --> L["Learning review and fixtures"]
~~~

## 8. Regression and change-control workflow

For a code or policy change:

1. Start from the exact review branch and inspect its status. Preserve user changes.
2. Make the smallest bounded change on an isolated review branch.
3. Add an adversarial fixture for the failure mode and a positive fixture for the intended path.
4. Run the focused test first, then the complete suite with npm test and npm run test:ci.
5. Record the branch, commit, changed paths, runtime versions, test counts, unresolved findings, rollback, and next gate in ops/build-ledger.md.
6. Review the complete diff. Protected policy, schema, workflow, agent, and dependency paths require explicit human review.
7. Keep merge, release, deployment, permission changes, spending, and external outreach as separate authorized decisions.

If the branch must be backed out, revert the specific commit with git revert <commit-sha>. Preserve history; do not force-reset a shared branch.

## 9. Limits and evidence quality

- GHT is a toolkit of records and deterministic evaluators, not a hosted orchestration service or runtime permission system.
- A valid schema means the record has the required shape; it does not mean the record is true.
- Actor authorization, scope authorization, DiffWall results, approval evidence, and URLs are supplied claims unless the calling system independently authenticates and resolves them.
- ALLOW means “this record passes the evaluated policy,” not “the operation happened” or “the operation is safe in every context.”
- Examples and regression fixtures are synthetic. Local or CI test success does not establish production behavior, customer adoption, legal rights, source factual accuracy, or commercial outcomes.
- The RAG adapter has no live retriever, persistence, key-rotation service, permission-verification service, or action executor.

When reporting a decision, include the exact request ID, policy version, gate, conformance verdict, findings, evidence references, test evidence, and what remains unverified. Label proposals, assumptions, and simulated results separately from observed facts.
