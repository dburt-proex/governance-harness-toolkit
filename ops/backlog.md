# Toolkit Build Backlog

Priority is evidence-weighted leverage, not feature count.

| ID | Work item | Why it matters | State | Proof required |
|---|---|---|---|---|
| TK-001 | Define source registry schema and freshness states | Prevent stale evidence from entering trusted outputs | complete | `schemas/source-record.schema.json` plus 3 passing regression cases |
| TK-002 | Define governed intake record | Make routing explicit and repeatable | complete | `schemas/intake-record.schema.json` plus 4 passing regression cases |
| TK-003 | Implement decision memo record | Preserve decisions, alternatives, risks, and owner | review | Draft PR #2, completed sample, evaluator, and 4 passing cases |
| TK-004 | Implement output evaluation record | Create a release gate before trust or publication | review | Draft PR #3, completed sample, evaluator, and 4 passing cases |
| TK-005 | Define action and connector permission matrix | Keep consequential actions controlled | queued | ALLOW/REVIEW/HALT matrix |
| TK-006 | Build compounding learning loop | Convert failures and reviews into system improvements | queued | Weekly review fixture |

## Selection rule

Choose the highest-priority item whose dependencies are satisfied and whose completion creates reusable control for multiple workflows. Do not start interface work until the relevant schema and evaluator exist.

An item in review is not eligible for additional automated mutation. Continue with the next independent queued item, but do not depend on unmerged artifacts.
