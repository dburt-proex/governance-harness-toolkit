# Toolkit Build Contract

## Mission

Build a governed AI operating layer that is reliable under real workload. Every important request must move through an explicit intake, evidence, decision, implementation, evaluation, approval, and record path.

## Canonical success criteria

- Clear operating path
- Reliable, current context
- Traceable evidence and decisions
- Reusable workflow Skills
- Least-privilege actions with approval gates
- Explicit quality and release checks
- Durable records outside chat history
- Useful interfaces only after schemas stabilize
- Automation that reports change and escalates exceptions
- Adoption that is faster and safer than improvisation

## Invariants

1. No unsupported claim becomes trusted context.
2. No consequential action executes without the required approval.
3. No failure is discarded; it becomes a fix, regression fixture, rule, or owned blocker.
4. No artifact is marked complete without evidence and a recorded evaluator result.
5. Code changes require tests and an isolated branch or pull request.
6. CASA, DiffWall, Operator Intelligence, and other product repositories remain independent unless an explicit architecture decision changes that boundary.

## Build-loop protocol

1. Inspect the current repository, ledger, backlog, fixtures, and recent review.
2. Select one highest-leverage incomplete item.
3. Make one bounded, reversible change.
4. Add or update the smallest relevant test or regression fixture.
5. Run available checks.
6. Record scope, evidence, files, result, confidence, risks, and next action in `ops/build-ledger.md`.
7. Stop at REVIEW when required evidence, access, or approval is missing.

## Acceptance matrix

| Area | Required proof |
|---|---|
| Intake and routing | A request is classified into a known workflow |
| Evidence | Sources have authority, purpose, freshness, and status |
| Decisions | Decision, alternatives, assumptions, risks, and owner are recorded |
| Evaluation | Regression fixtures produce repeatable pass/fail results |
| Action control | Sensitive actions are gated and auditable |
| Durability | Final artifacts and decisions are recoverable outside chat |
| Learning | Run history changes the backlog, rules, or test suite |

## Change policy

Documentation and tests may be committed when bounded and verified. Executable-code changes must be isolated to a branch or pull request. Never merge, deploy, delete data, or grant permissions from the automated loop.
