# Toolkit Integrity Review — 2026-07-16

## Verdict

**Overall: FAIL**  
**Implementation regressions: PASS (39/39)**  
**Governance integrity: FAIL**  
**Confidence: high (0.94)**

The implemented schemas and deterministic evaluators behaved as expected, including the open workflow-routing increment. The repository does not yet satisfy the operating objective under handoff: canonical state records contradict merged repository state, promotion approval evidence is absent from the merged executable pull requests, and regression execution is not repository-native.

## Scope and evidence

Reviewed:

- `governance/build-contract.md` at blob `d829e6db98651b6c8d6b629e847beb63fe7aebba`
- `ops/backlog.md` at blob `3db4913e33cb643f9fd62b8ff38cfaabc5ee25c9`
- `ops/build-ledger.md` at blob `427ffb64e848daa0ed1224dedbb26679eb0f591b`
- Schemas, evaluators, examples, policies, and regression fixtures present on `main`
- Recent merged pull requests #2, #3, #4, #5, #6, and #8
- Open draft pull request #9 and its workflow schema, evaluator, example, and fixture
- GitHub review submissions for pull requests #2, #3, #4, #5, #6, #8, and #9
- Repository searches for a package manifest, unified test command, and CI workflow
- Operational URL references in the reviewed artifacts

## Verification

An isolated Ajv 8 / JSON Schema Draft 2020-12 harness was used because no repository-native unified runner was found.

| Suite | Result |
| --- | ---: |
| Governed source schema | 3/3 PASS |
| Governed intake | 4/4 PASS |
| Decision record evaluator | 4/4 PASS |
| Output evaluation gate | 4/4 PASS |
| Action permission evaluator | 5/5 PASS |
| Learning review evaluator | 5/5 PASS |
| Source policy evaluator | 4/4 PASS |
| Build-run evaluator | 5/5 PASS |
| Draft PR #9 workflow routing | 5/5 PASS |
| **Total** | **39/39 PASS** |

The tested cases cover ALLOW, REVIEW, HALT, schema-invalid, gate-mismatch, stale-source, missing-skill, excessive-write-authority, unresolved-assumption, consequential-action, and incomplete-run behavior.

## Acceptance matrix

| Capability | Verdict | Evidence and qualification |
| --- | --- | --- |
| Clear intake and routing | REVIEW | Intake schema and four fixtures pass. Draft PR #9 adds executable workflow routing and passes 5/5, but it is not on `main`. |
| Source authority and freshness | PASS | Source schema and policy evaluator pass 7/7 combined cases. Freshness is reproducible with an explicit `as_of` date. Authenticated registry resolution remains an owned integration risk. |
| Traceable decisions | PASS | Decision record schema/evaluator pass 4/4 and preserve evidence, alternatives, assumptions, risks, confidence, approval, and review triggers. Approval identity is asserted, not authenticated. |
| Reusable workflows | REVIEW | Purpose-built Skill references exist, and PR #9 defines one governed workflow. The canonical workflow registry remains unmerged; TK-010 Skill registry remains queued. |
| Least-privilege actions | PASS | Deny-first action policy passes 5/5 across read, scoped write, production review, permission halt, and secret-transmission halt. Live connector enforcement is not yet evidenced. |
| Quality gates | FAIL | Artifact-level gates pass, but there is no durable repository-native runner or automatic CI gate. Issue #11 owns remediation. |
| Durable records | FAIL | Machine-checkable build-run records pass 5/5, but the human-readable backlog and ledger are stale after merges. Issue #10 owns reconciliation and a post-merge gate. |
| Controlled automation | FAIL | Deterministic evaluators exist, but automatic regression execution and post-merge state reconciliation are missing. Approval evidence for merged executable work is not recoverable from submitted PR reviews. |
| Handoff readiness | FAIL | A new operator would see TK-003 through TK-008 as unmerged even though their PRs are merged, and would need to reconstruct the test harness. |

## Integrity findings

### 1. Canonical state drift — FAIL

Pull requests #2, #3, #4, #5, #6, and #8 are merged. The backlog still marks TK-003 through TK-008 as `REVIEW`, and ledger entries still state that those executable changes are unmerged and pending human approval.

No submitted GitHub PR reviews were returned for those merged PRs. This does not prove that the owner did not make a promotion decision, but the required approval evidence is not durable or auditable in the canonical repository.

Converted to [issue #10](https://github.com/dburt-proex/governance-harness-toolkit/issues/10), assigned to `dburt-proex`.

### 2. Regression execution is not durable — FAIL

No repository-native package manifest, unified regression command, or CI workflow was found through canonical-record inspection and repository search. The current implementation passed only after reconstructing an isolated harness.

Converted to [issue #11](https://github.com/dburt-proex/governance-harness-toolkit/issues/11), assigned to `dburt-proex`.

### 3. Evidence freshness and links — PASS with qualification

- The governed source example was retrieved on 2026-07-15 and remains current for this review.
- The source policy suite explicitly tests a current record, an expired record, an incoherent record, and a corroboration-required record.
- The canonical GitHub source link and OpenAI Help source resolved during review.
- Pull-request references #2 through #6, #8, and #9 exist.
- `example.com` URLs are synthetic fixture values, not production evidence links.
- The `dburt-proex.github.io` schema `$id` values were not independently retrievable during this run. They are treated as JSON Schema identifiers, not operational evidence links. Whether they are intended to be published resolvable schemas remains an explicit low-risk assumption.

### 4. Undocumented and unresolved assumptions — REVIEW

- Human identity and approval assertions are not authenticated; this is already recorded in the build ledger and materially affects the merged-approval finding.
- The approved source-registry decision assumes structured source records can precede a persistence layer; the example marks this verified, but the integration evidence is not yet present.
- Runtime enforcement of connector permissions and automatic build-run emission remain implementation assumptions rather than demonstrated controls.

These are not newly classified implementation failures; they remain owned integration risks. Issue #10 covers approval-evidence durability. Issue #11 covers automatic verification.

### 5. Drift from governing objective — REVIEW

The code artifacts continue to support the governing objective: route work, classify evidence, evaluate outputs, constrain action, and preserve learning. Operational behavior has drifted from it because the repository cannot currently prove why executable changes were promoted and cannot reproduce its full verification without an ad hoc harness.

## Prioritized next actions

1. **P0 — Reconcile promotion state and evidence:** resolve issue #10 before treating TK-003 through TK-008 as trusted production references.
2. **P0 — Make verification reproducible:** resolve issue #11 with a pinned runner and CI gate using the current 39-case baseline.
3. **P1 — Review PR #9:** preserve the 5/5 workflow-routing evidence, then approve, revise, or reject without inferring approval from merge state.
4. **P1 — Implement TK-010:** add a governed Skill registry only after the workflow contract is resolved.
5. **P2 — Demonstrate integration controls:** authenticate approval identity, enforce connector permissions at runtime, and emit build-run records automatically.

## Blockers

- **Owner: dburt-proex** — promotion approval evidence for merged executable PRs is absent from canonical submitted reviews. Recovery: document the actual promotion decisions or explicitly record the evidence gap, then reconcile backlog and ledger.
- **Owner: Toolkit maintainer** — no repository-native regression entrypoint. Recovery: add a pinned runner and CI workflow that reproduces the 39-case baseline.

## Release posture

**HALT promotion claims based solely on the current backlog or ledger.** Existing artifacts may be evaluated and developed further on isolated branches, but they should not be represented as fully governed until issues #10 and #11 are resolved with evidence.
