# Toolkit Build Backlog

Priority is evidence-weighted leverage, not feature count.

| ID | Work item | Why it matters | State | Proof required |
|---|---|---|---|---|
| TK-001 | Define source registry schema and freshness states | Prevent stale evidence from entering trusted outputs | complete | `schemas/source-record.schema.json` plus 3 passing regression cases |
| TK-002 | Define governed intake record | Make routing explicit and repeatable | complete | `schemas/intake-record.schema.json` plus 4 passing regression cases |
| TK-003 | Implement decision memo record | Preserve decisions, alternatives, risks, and owner | review | Merged PR #2 and 4 passing cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-004 | Implement output evaluation record | Create a release gate before trust or publication | review | Merged PR #3 and 4 passing cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-005 | Define action and connector permission matrix | Keep consequential actions controlled | review | Merged PR #4 and 5 passing cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-006 | Build compounding learning loop | Convert failures and reviews into system improvements | review | Merged PR #5 and 5 passing cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-007 | Implement source policy coherence evaluator | Close cross-field freshness and eligibility gaps that structural validation cannot detect | review | Merged PR #6 and 4 policy regression cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-008 | Define durable build-run record | Make each automated increment recoverable and machine-checkable outside chat history | review | Merged PR #8 and 5 passing cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-009 | Define governed workflow registry | Give intake routing canonical workflow, Skill, deliverable, gate, and ownership definitions | review | Merged PR #9 and 5 passing cases; promotion approval evidence remains UNKNOWN under issue #10 |
| TK-011 | Reconcile merged work records and add a post-merge state gate | Prevent canonical backlog, ledger, PR, and approval evidence from disagreeing | queued | Issue #10 resolved, TK-003 through TK-009 reconciled, approval gaps explicit, and a state-mismatch regression guard |
| TK-012 | Add a repository-native regression runner and CI gate | Make quality verification reproducible without rebuilding an ad hoc harness | queued | Issue #11 resolved, pinned test command, 39-case baseline, non-zero failure behavior, and CI evidence |
| TK-010 | Define governed Skill registry | Make reusable execution discoverable, versioned, owned, and compatibility-checked | queued | Skill-record schema plus available, missing, and incompatible regression cases |

## Selection rule

Choose the highest-priority item whose dependencies are satisfied and whose completion creates reusable control for multiple workflows. Do not start interface work until the relevant schema and evaluator exist.

An item in review is not eligible for additional automated mutation. Continue with the next independent queued item, but do not depend on unreviewed artifacts.

## Integrity priority rule

An open integrity failure that prevents canonical-state recovery or reproducible evaluation outranks new feature work. Resolve TK-011, then TK-012, before starting TK-010. A merged pull request does not by itself prove governed completion; missing promotion evidence must remain explicit as `UNKNOWN`.
