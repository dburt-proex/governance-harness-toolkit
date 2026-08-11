# governance-harness-toolkit

## Regression suite

Install the pinned dependencies and run the complete deterministic regression suite:

```sh
npm ci
npm test
```

For a machine-readable result, run:

```sh
node run-regression.js --json
```

## Workflow execution and input trust

The canonical fleet contract is documented in `governance/workflow-execution-input-trust.md` and enforced by:

- `policies/workflow-execution-input-trust.json` — trust classes, separate authority grants, triggers, gates, protected paths, Action pinning, failure behavior, and evidence retention.
- `schemas/workflow-execution-trust.schema.json` — closed execution-request record.
- `evaluators/workflow-execution-trust.js` — deterministic ALLOW / REVIEW / HALT evaluator.
- `fixtures/workflow-execution-trust/regression-cases.json` — positive and adversarial conformance cases.

Run the completed example with:

```sh
node evaluators/workflow-execution-trust.js \
  policies/workflow-execution-input-trust.json \
  examples/workflow-execution-trust/scoped-staged-write.json
```
