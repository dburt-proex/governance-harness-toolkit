# Toolkit Build Backlog

Priority is evidence-weighted leverage, not feature count.

| ID | Work item | Why it matters | State | Proof required |
|---|---|---|---|---|
| TK-001 | Define source registry schema and freshness states | Prevent stale evidence from entering trusted outputs | complete | `schemas/source-record.schema.json` plus 3 passing regression cases |
| TK-002 | Define governed intake record | Make routing explicit and repeatable | complete | `schemas/intake-record.schema.json` plus 4 passing regression cases |
| TK-003 | Implement decision memo record | Preserve decisions, alternatives, risks, and owner | merged | PR #2 merged; 4 passing cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-004 | Implement output evaluation record | Create a release gate before trust or publication | merged | PR #3 merged; 4 passing cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-005 | Define action and connector permission matrix | Keep consequential actions controlled | merged | PR #4 merged; 5 passing cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-006 | Build compounding learning loop | Convert failures and reviews into system improvements | merged | PR #5 merged; 5 passing cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-007 | Implement source policy coherence evaluator | Close cross-field freshness and eligibility gaps that structural validation cannot detect | merged | PR #6 merged; 4 policy regression cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-008 | Define durable build-run record | Make each automated increment recoverable and machine-checkable outside chat history | merged | PR #8 merged; 5 passing cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-009 | Define governed workflow registry | Give intake routing canonical workflow, Skill, deliverable, gate, and ownership definitions | merged | PR #9 merged; 5 passing cases; promotion approval evidence is MISSING (no submitted review) and blocks governed completion |
| TK-011 | Reconcile merged work records and add a post-merge state gate | Prevent canonical backlog, ledger, PR, and approval evidence from disagreeing | merged | PR #13 merged at `ebaada08c709b34ef3b44c1bf8adce3bfdaeb04b`; post-merge reconciliation guard exists. Two submitted approvals reference pre-final-head `9c1f3de6d30cb01be1687321ac0f22d9f6e4bf4a`; exact-head promotion evidence remains REVIEW. |
| TK-012 | Add a repository-native regression runner and CI gate | Make quality verification reproducible without rebuilding an ad hoc harness | merged | PR #12 merged at `a52ccd1ecd80b32239e5728c204451fad93db606`; pinned runner and CI exist. No submitted approval evidence was returned; governed completion remains MISSING. |
| TK-010 | Define governed Skill registry | Make reusable execution discoverable, versioned, owned, and compatibility-checked | merged | PR #21 merged at `e668c74772aff74f8aad522bdc71fc738c3b3f9f`; Run 013 records owner-approved closeout and 91/91 merged-main regression. No submitted approval evidence was returned; independent merge-commit CI visibility remains REVIEW. |

## Selection rule

Choose the highest-priority item whose dependencies are satisfied and whose completion creates reusable control for multiple workflows. Do not start interface work until the relevant schema and evaluator exist.

An item in review is not eligible for additional automated mutation. Continue with the next independent queued item, but do not depend on unreviewed artifacts.

## Integrity priority rule

An open integrity failure that prevents canonical-state recovery or reproducible evaluation outranks new feature work. Resolve TK-011, then TK-012, before starting TK-010. A merged pull request does not by itself prove governed completion; missing promotion evidence must remain explicit as `UNKNOWN`.
