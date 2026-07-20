# Toolkit Weekly Learning Review

## Review period

- Period: 2026-07-13 through 2026-07-20
- Generated: 2026-07-20
- Review ID: LRN-2026-07-20
- Declared gate: REVIEW
- Confidence: high for repository-state and regression findings; medium for approval intent
- Governing objective: make important work faster, consistent, verifiable, controlled, durable, and easy to hand off

## Evidence reviewed

- `governance/build-contract.md`
- `ops/build-ledger.md`, Runs 001 through 009
- `ops/backlog.md` before and after this review
- `ops/reviews/2026-07-16-integrity-review.md`
- Current schemas, evaluators, examples, permission policy, and regression fixtures on `main`
- Pull requests #2 through #9, including the closed duplicate PR #7
- Merge commit `99d73424a25eeeec3fa08174867c364bcd0f697a` for PR #9 on 2026-07-18
- Open integrity issues #10 and #11
- Reconstructed full-suite execution on 2026-07-20

## Evaluator and regression result

- Source schema: 3/3 PASS
- Intake schema: 4/4 PASS
- Decision evaluator: 4/4 PASS
- Output evaluator: 4/4 PASS
- Action permission evaluator: 5/5 PASS
- Learning evaluator: 5/5 PASS
- Source policy evaluator: 4/4 PASS
- Build-run evaluator: 5/5 PASS
- Workflow routing evaluator: 5/5 PASS
- Total: **39/39 PASS**

The initial local verification reported 35/39 because the temporary harness checked `computed_gate` instead of the evaluator's actual `release_gate` field. The harness was corrected, all 39 cases were rerun, and the complete suite passed. A separate npm cache-path failure was corrected by moving the isolated cache to `/tmp`.

These were verification-environment failures, not product regressions. They strengthen the evidence for issue #11: ad hoc reconstruction creates avoidable false alarms and repeated setup work.

## What was learned

### 1. Verification setup is the most repeated source of friction

Ajv or its temporary environment had to be restored in Runs 003, 006, and 007. This review again required an isolated install, encountered an npm cache-path failure, and briefly produced four false failures because the harness contract was reconstructed incorrectly.

Pattern: the product fixtures are stable, but the method for running them is not durable.

Disposition: issue #11 remains P0 and is now backlog item TK-012. No new evaluator was invented because the evidence supports a runner and CI gate, not a behavior change.

### 2. Canonical state does not reconcile after merges

PRs #2 through #6, #8, and now #9 are merged, while the ledger still describes them as unmerged and the backlog previously described their proof as draft PRs. Submitted promotion-review evidence is absent for the merged executable PRs.

Pattern: build evidence is recorded before review, but there is no post-merge reconciliation step.

Disposition: issue #10 remains P0 and is now backlog item TK-011. Backlog proof text now distinguishes merged state from governed completion and records missing promotion evidence as `UNKNOWN`.

### 3. The previous priority rule favored feature progress over integrity recovery

TK-010 remained the next queued feature even after the integrity review found that canonical recovery and repeatable verification were failing.

Pattern: the selection rule optimized for implementation leverage but did not explicitly elevate integrity blockers.

Disposition: added an integrity priority rule to `ops/backlog.md`. TK-011 and TK-012 now precede TK-010.

### 4. Strict conditional-schema defects recur

Runs 003, 005, and 009 each found a conditional-schema boundary or required-field defect during strict validation.

Pattern: the same schema-authoring class has recurred three times.

Disposition: no schema was changed this week because all current schemas compile and 39/39 cases pass. TK-012 must preserve strict compilation across every schema. A dedicated reusable conditional-schema fixture remains a justified follow-on only if the unified runner does not already make these failures obvious.

### 5. Concurrent execution created duplicate work once

PR #7 duplicated TK-007 after the canonical repository advanced concurrently. It was closed without merge.

Pattern: selection can race when two runs read the same queued state.

Disposition: TK-011's post-merge/state gate should include a fresh canonical-state read immediately before branch creation and before recording a selected work item. No new automation rule is marked implemented until this behavior is tested.

### 6. Runtime evidence controls remain asserted

Source ownership, content hashes, connector identity, installed Skill identity, and human approval identity are recorded but not independently resolved. The current evaluators correctly govern supplied records, but the integration layer does not yet prove those inputs.

State: **UNKNOWN** for authenticated runtime enforcement. No change was made because the week contains no integration evidence sufficient to choose a secure identity or registry mechanism.

## Change made

### `ops/backlog.md`

- Replaced stale “Draft PR” proof descriptions for TK-003 through TK-009 with actual merged state.
- Kept those items in REVIEW because promotion approval evidence is UNKNOWN.
- Added TK-011 for canonical-state reconciliation and a post-merge state gate.
- Added TK-012 for a pinned repository-native runner and CI gate.
- Added an integrity priority rule that puts TK-011 and TK-012 ahead of TK-010.
- Preserved all existing work-item IDs and feature contracts.

No executable code, schema, evaluator, Skill, permission, or runtime policy changed. Backward compatibility is therefore preserved.

### `ops/learning-review.md`

- Created this durable weekly review.
- Captured evidence, recurrence patterns, corrected verification failures, uncertainties, expected impact, and next sequence outside chat history.

## Why this change was justified

The evidence shows two active integrity failures, issues #10 and #11, while the feature backlog still directed the next run to TK-010. Advancing the Skill registry first would compound unreliable state and require another ad hoc harness. Reordering the work prevents new features from outrunning the controls needed to trust and reproduce them.

## Expected impact

- Future runs select integrity recovery before feature expansion.
- Merged state and governed completion are no longer conflated in the backlog.
- Unknown approval evidence remains visible instead of being inferred.
- The next test-runner increment has a concrete 39-case baseline.
- Handoff friction should fall once TK-011 and TK-012 are complete.
- No existing artifact consumer should break because no executable contract changed.

## Remaining uncertainty

| Uncertainty | State | Owner | Next evidence |
|---|---|---|---|
| Whether each merged executable PR received a valid promotion decision outside submitted GitHub reviews | UNKNOWN | dburt-proex | Durable approval record or explicit evidence-gap decision |
| Whether connector and approval identities can be authenticated with current integration capabilities | UNKNOWN | Integration owner | Tested identity-resolution design |
| Whether a unified runner alone prevents recurring conditional-schema mistakes | UNKNOWN | Toolkit maintainer | CI history after TK-012 |
| Whether post-merge reconciliation should update records automatically or open a blocker | UNKNOWN | Governance owner | Tested TK-011 policy and failure fixture |
| Whether Skill identities can be resolved against an installed registry | UNKNOWN | Skill registry owner | TK-010 design after integrity remediation |

## Next week's governed build sequence

1. **TK-011, P0:** reconcile backlog, ledger, PR state, and promotion evidence; add a regression guard for state mismatch and a fresh-state check that prevents duplicate selection.
2. **TK-012, P0:** add the pinned repository-native runner and CI gate; reproduce the current 39/39 baseline and emit machine-readable results.
3. **Integrity recheck:** require both state consistency and a clean runner result before feature work resumes.
4. **TK-010, P1:** define the governed Skill registry with available, missing, incompatible, ownership, version, and approval cases.
5. **Integration discovery, REVIEW only:** identify authenticated source, connector, Skill, and approval identity mechanisms; record UNKNOWN where evidence remains absent.

## Review verdict

**REVIEW**

The artifact implementation baseline is healthy at 39/39. The system is not ready for an ALLOW learning verdict because canonical state reconciliation, promotion evidence, and reproducible verification remain unresolved. The bounded documentation and priority changes in this review are complete and verified; executable remediation remains queued and must follow the branch-and-test policy.
