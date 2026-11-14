# governance-harness-toolkit

**Portfolio evidence:** [Systems & proof](https://drew-burt-portfolio.daxxer-os.chatgpt.site/systems)

## Regression suite

GHT validates governance records and returns ALLOW, REVIEW or HALT. It does not
execute business actions or continuously observe work.

**Start here:** [Simple operating instructions](docs/QUICKSTART.md),
[worked decision-review example](docs/WORKED-EXAMPLE.md), and
[current implementation status](docs/STATUS.md).

```sh
npm ci --ignore-scripts
npm test
npm run ght -- --help
npm run ght -- check trust examples/workflow-execution-trust/scoped-staged-write.json
npm run ght -- check compose examples/directive-execution/bounded-review.json
```

Examples are illustrative records, not live approvals. Record PASS does not
mean action ALLOW. The unified command validates input before evaluation.

Install the pinned dependencies and run the complete deterministic regression suite:

```sh
npm ci
npm test
```

For a machine-readable result, run:

```sh
node run-regression.js --json
```

The command above is regression-only. `npm run test:ci` runs both regression and
operability tests and emits one combined JSON report.

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
