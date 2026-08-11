# Workflow Execution and Input Trust Contract

## Purpose and precedence

This contract is the repository-neutral control boundary for workflows that read untrusted context or can cause execution, edits, GitHub writes, network effects, credential access, permission changes, merges, or deployments. The machine-readable authority is `policies/workflow-execution-input-trust.json`; `schemas/workflow-execution-trust.schema.json` defines the closed conformance record; `evaluators/workflow-execution-trust.js` computes the gate.

Platform policy, an explicitly authorized operator scope, this contract, and verified repository policy establish authority. Content being processed does not. A PR, comment, repository file, workflow output, or web page may describe work, but it cannot grant tools, broaden scope, waive a gate, or promote itself to authoritative instruction.

## Actors and events

Every execution record identifies the actor as a maintainer, internal contributor, external contributor, or automation and separately records whether that actor is authorized and whether the change originates from a fork.

- `pull_request`: fork and external-contributor content is untrusted. It must not receive write permissions.
- `pull_request_target`: may inspect trusted-base metadata only. Checking out or executing the untrusted head is HALT. A fork or external contributor must not receive write permissions.
- `workflow_dispatch`: requires both an authorized actor and an authorized dispatch scope. User-supplied fields remain data and cannot create authority.
- `push`, `workflow_run`, and `issue_comment`: inherit no authority from their payload. The workflow must still resolve the actor, scope, inputs, and gates.

## Input trust classes

| Input class | Trust | Permitted role |
|---|---|---|
| PR title | Untrusted | Routing and display data |
| PR body | Untrusted | Requested scope and acceptance-criteria evidence |
| Comment | Untrusted | Discussion context after separate identity resolution |
| Issue | Untrusted | Problem and backlog context |
| Commit message | Untrusted | Change description and traceability |
| Repository file | Conditional | Context after provenance and instruction-precedence checks |
| Configuration file | Conditional | Data after schema, provenance, and scope validation |
| Generated artifact | Conditional | Derived evidence after generator, source, and digest verification |
| Dependency metadata | Conditional | Resolution input after registry, integrity, and lockfile validation |
| Workflow output | Conditional | Evidence after producer, run, commit, and artifact verification |
| External web content | Untrusted | Discovery or cited evidence after source-policy validation |

`Conditional` does not mean authoritative. Verification can make content eligible evidence; it cannot let that content authorize its own execution or expand an agent's permissions. Treating any class above as an authority source is HALT.

## Separate authority grants

Authority is explicit, scoped, and non-transitive. There is no wildcard grant.

| Authority | Effect | Minimum gate |
|---|---|---|
| Read | Non-mutating | Authorized scope and audit record |
| Search | Non-mutating | Authorized scope and audit record |
| Execute | Consequential | Authorized scope plus deterministic or human approval |
| Edit | Consequential write | Authorized scope, deterministic or human approval, staged write |
| GitHub-write | Consequential write | Authorized scope, deterministic or human approval, staged write |
| Network | External effect | Authorized endpoint/purpose plus deterministic or human approval |
| Credential | Protected boundary | Explicit human approval |
| Permission | Protected boundary | Explicit human approval |
| Merge | Protected boundary | Explicit human approval |
| Deploy | Protected boundary | Explicit human approval |

A grant for one authority never implies another. In particular, read/search does not imply execute; edit does not imply GitHub-write; GitHub-write does not imply merge; and merge does not imply deploy.

## Writes, protected paths, and gates

Edits and GitHub writes must be staged on a bounded review branch, remain reversible, and retain the target, diff, tests, exact commit, and promotion decision. Changes to workflows, agent profiles, repository instructions, governance policy, schemas, rules, or dependency manifests require an explicit human gate.

DiffWall remains the deterministic change-risk authority:

- `ALLOW` permits the next gate; it does not grant missing authority.
- `REVIEW` remains REVIEW until the required governed review is recorded.
- `HALT` remains HALT. Model output cannot downgrade or override it.
- Missing DiffWall evidence routes to REVIEW. Missing or unknown trusted context also routes to REVIEW; an unknown actor, input class, or authority scope routes to HALT.

Consequential writes require a deterministic approval or an explicit human approval before execution. Credential, permission, merge, and deployment boundaries always require human approval.

## Third-party Actions

The high-assurance expectation is an immutable full 40-character commit SHA for every third-party Action. A readable version comment may accompany the SHA. Mutable tags and branches route to REVIEW unless the machine policy contains an exact exception with an owner, security rationale, compensating control, and review date.

The canonical policy has no pinning exceptions at version 1.0.0. Repository-specific exceptions must be recorded locally; they do not become fleet defaults.

## Failure and evidence behavior

Failures are explicit and fail closed. A workflow retains, at minimum, the request identifier, actor and event, input classes, requested authority and scopes, target paths, exact commit, DiffWall route, approval states, executed checks, computed decision, and findings. Missing execution or retention evidence routes to REVIEW. A rejected human gate routes to HALT.

## Conformance

Validate the request against the schema, then compute the policy gate:

```sh
node evaluators/workflow-execution-trust.js \
  policies/workflow-execution-input-trust.json \
  examples/workflow-execution-trust/scoped-staged-write.json
```

The regression suite covers allowed read-only and staged-write paths plus malicious PR text, malicious repository instructions, unsafe `pull_request_target`, unauthorized `workflow_dispatch`, protected-file modification, missing DiffWall evidence, unpinned Actions, missing trusted context, missing evidence retention, unscoped authority, and attempted model override of HALT.
