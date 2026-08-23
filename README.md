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

## Agent Plugins 1.0 and MCP governance compatibility

The canonical compatibility profile is documented in `governance/agent-plugins-mcp-compatibility.md` and enforced by:

- `policies/agent-plugin-mcp-governance.json` — Toolkit profile version, upstream pins, annotation requirements, prohibited inputs, operation classes, and authority mappings.
- `schemas/agent-plugin-mcp-compatibility.schema.json` — closed plugin, server, tool, control, and evidence record.
- `evaluators/agent-plugin-mcp-compatibility.js` — deterministic ALLOW / REVIEW / HALT evaluator.
- `fixtures/agent-plugin-mcp-compatibility/regression-cases.json` — positive, review, halt, schema-invalid, and gate-downgrade cases.

In this repository, “Agent Plugins 1.0” is a Toolkit-defined profile version, not an upstream OpenAI protocol-version claim. Profile `1.0.0` pins the OpenAI Agent Plugins documentation snapshot dated `2026-08-23` and MCP `2026-07-28` separately.

Run the completed read-only proof with:

```sh
node evaluators/agent-plugin-mcp-compatibility.js \
  policies/agent-plugin-mcp-governance.json \
  examples/agent-plugin-mcp-compatibility/read-only-governance-catalog.json
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
