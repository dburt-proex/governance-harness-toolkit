# Toolkit Build Backlog

Priority is evidence-weighted leverage, not feature count.

| ID | Work item | Why it matters | State | Proof required |
|---|---|---|---|---|
| TK-001 | Define source registry schema and freshness states | Prevent stale evidence from entering trusted outputs | complete | `schemas/source-record.schema.json` plus 3 passing regression cases |
| TK-002 | Define governed intake record | Make routing explicit and repeatable | complete | `schemas/intake-record.schema.json` plus 4 passing regression cases |
| TK-003 | Implement decision memo record | Preserve decisions, alternatives, risks, and owner | review | Draft PR #2, completed sample, evaluator, and 4 passing cases |
| TK-004 | Implement output evaluation record | Create a release gate before trust or publication | review | Draft PR #3, completed sample, evaluator, and 4 passing cases |
| TK-005 | Define action and connector permission matrix | Keep consequential actions controlled | review | Draft PR #4, permission matrix, evaluator, and 5 passing cases |
| TK-006 | Build compounding learning loop | Convert failures and reviews into system improvements | review | Draft PR #5, weekly review example, evaluator, and 5 passing cases |
| TK-007 | Implement source policy coherence evaluator | Close cross-field freshness and eligibility gaps that structural validation cannot detect | review | Draft PR #6, deterministic evaluator, and 4 policy regression cases |
| TK-008 | Define durable build-run record | Make each automated increment recoverable and machine-checkable outside chat history | review | Draft PR #8, run-record schema, completed fixture, evaluator, and 5 passing cases |
| TK-009 | Define governed workflow registry | Give intake routing canonical workflow, Skill, deliverable, gate, and ownership definitions | review | Draft PR #9, workflow schema, routing evaluator, approved example, and 5 passing cases |
| TK-010 | Define governed Skill registry | Make reusable execution discoverable, versioned, owned, and compatibility-checked | queued | Skill-record schema plus available, missing, and incompatible regression cases |

## Selection rule

Choose the highest-priority item whose dependencies are satisfied and whose completion creates reusable control for multiple workflows. Do not start interface work until the relevant schema and evaluator exist.

An item in review is not eligible for additional automated mutation. Continue with the next independent queued item, but do not depend on unmerged artifacts.
