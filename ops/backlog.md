# Toolkit Build Backlog

Priority is evidence-weighted leverage, not feature count.

| ID | Work item | Why it matters | State | Proof required |
|---|---|---|---|---|
| TK-001 | Define source registry schema and freshness states | Prevent stale evidence from entering trusted outputs | queued | Schema plus fixtures |
| TK-002 | Define governed intake record | Make routing explicit and repeatable | queued | Valid and invalid examples |
| TK-003 | Implement decision memo record | Preserve decisions, alternatives, risks, and owner | queued | Completed sample and evaluator |
| TK-004 | Implement output evaluation record | Create a release gate before trust or publication | queued | Regression fixture set |
| TK-005 | Define action and connector permission matrix | Keep consequential actions controlled | queued | ALLOW/REVIEW/HALT matrix |
| TK-006 | Build compounding learning loop | Convert failures and reviews into system improvements | queued | Weekly review fixture |

## Selection rule

Choose the highest-priority item whose dependencies are satisfied and whose completion creates reusable control for multiple workflows. Do not start interface work until the relevant schema and evaluator exist.
