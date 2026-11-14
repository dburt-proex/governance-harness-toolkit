# Operate GHT

GHT checks records and returns a decision. It does not execute the proposed business action. Run these commands from the repository folder with Node.js and npm installed. The existing CI uses Node 20; local verification for this increment used Node 24.16.0.

## 1. Install and check

```powershell
npm ci --ignore-scripts
npm test
```

`npm test` runs both the original regression cases and the new integration/operability tests. `npm run test:ci` returns a combined JSON report. `node run-regression.js --json` retains the original regression-only interface.

## 2. Understand the result

| Display | Meaning | Your next step |
| --- | --- | --- |
| Decision: ALLOW | This check found no blocker | Check remaining authority and execution controls |
| Decision: REVIEW | Evidence or human review remains necessary | Resolve the reasons, then rerun |
| Decision: HALT | Invalid input or a blocking condition | Stop and correct the condition |
| Record: PASS | The supplied record is consistent | Read the decision separately |

The unified command exits 0 for ALLOW, 1 for REVIEW, and 2 for HALT or invalid use. Legacy checker exit codes are retained and can differ. A complete regression pass does not approve a business action.

## 3. Try an existing check

```powershell
npm run ght -- check skills examples/workflows/research-brief.json --skills examples/skill-record/research-brief-registry.json
npm run ght -- check decision examples/decision-record/approved-source-registry.json
npm run ght -- check trust examples/workflow-execution-trust/scoped-staged-write.json
```

These check example records. They do not verify historical claims in the examples. Add `--json` for structured output.

## 4. Prepare a new intake

Create a local `work` folder first if you want to store drafts there:

```powershell
New-Item -ItemType Directory -Path work -Force
npm run ght -- intake work/request.json
```

Answer three questions: your name, purpose, and observable success criterion. The saved record is a **submitted draft**, with contributor authority, REVIEW status, no external writes and no sensitive data. These are restrictive drafting defaults, not a verified classification. Review the risk, domain, output and authority before checking the route:

```powershell
npm run ght -- check route work/request.json --workflow examples/workflows/research-brief.json
```

A declared/computed mismatch is expected if you have not finished classification; do not change a gate merely to obtain a green result. Review why they differ. The form refuses to overwrite an existing file.

## 5. Check a directive and execution together

```powershell
npm run ght -- check compose examples/directive-execution/bounded-review.json
```

The example freezes a historical evaluation time and uses illustrative evidence. It is a demonstration, not authority today. For actual use, prepare a bundle matching `schemas/directive-execution.schema.json`. Supply the real evaluation time, exact commit and repository. The composition requires:

- A valid, unexpired directive and exact approved Skill binding.
- A valid execution-trust record and policy.
- Every requested authority explicitly authorized by the directive.
- Every target an exact literal path in the directive; directory prefixes grant no descendant access.
- The same exact commit in the directive base, bundle and request evidence.
- No widening of external effects or bypass of REVIEW/HALT.

`repository_edit` is the directive action name corresponding to `edit`; `merge_pull_request` corresponds to `merge`; `permission_change` corresponds to `permission`. Other execution authority names map directly. Missing names are prohibited. Scope is compared, not authenticated against a live provider.

## 6. Review real decision evidence

The local adapter is the first connected workflow: read a decision file, check it, verify its local evidence and optional signed approval, and write a new review packet. It does not send, merge, deploy or act on the decision.

Follow [the worked example](WORKED-EXAMPLE.md). Try the safe demo first:

```powershell
npm run ght -- demo
```

The demo deliberately returns REVIEW (exit 1): the example has no independently supplied evidence files or authenticated approval. That is a successful demonstration of the boundary, not a failed installation.

## Available checks

| Check | Input | Extra arguments |
| --- | --- | --- |
| action | Action request | Optional `--policy`, defaults to local action matrix |
| build | Build record | None |
| decision | Decision record | None |
| learning | Learning review | None |
| output | Output evaluation | None |
| source | Source record | `--as-of YYYY-MM-DD` |
| route | Intake | `--workflow file.json` |
| skills | Workflow | `--skills registry.json` |
| binding | Directive | `--skills registry.json` |
| directive | Directive | `--as-of RFC3339-time` |
| trust | Execution request | Optional `--policy`, defaults to local trust policy |
| compose | Directive/execution bundle | Evaluation time is inside the bundle |
| reconcile | Backlog/ledger/PR state record | None |

## Common problems

- Missing module: run the pinned install again; do not skip checks.
- INPUT_INVALID: fix the named field; invalid input now fails closed.
- Missing source/approval evidence: use the evidence adapter; a bare approval string is insufficient for verified review.
- Expired directive: obtain a new applicable directive; do not rewrite historical time to make current work pass.
- Saved file exists: choose a new filename. Keep prior review packets.

`work/` is ignored by Git and is **not a backup**. Store final packets in your authorized durable destination. Hashes and signatures do not establish the truth of the underlying claims. Read [current status](STATUS.md) for integration limits.
