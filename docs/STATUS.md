# Current implementation status

This page describes the operability increment prepared on November 14, 2026, from upstream `1e46f6d0227acdc8e1390592b2a6b683d9a32ea2`. It is branch implementation evidence, not proof of merge, deployment or fleet adoption. Historical ledger/review entries remain historical and are not rewritten.

| Capability | State | Boundary |
| --- | --- | --- |
| Existing checkers | Implemented | Schema validation now precedes evaluation; malformed requests fail closed |
| JSON Schema | Draft 2020-12 engine | Uses Ajv's 2020 entry point and validates schemas |
| Plain-language command | Implemented | Decision, record status, findings, next action; optional JSON |
| TK-018 composition | Implemented and locally tested | Pure comparison of supplied directive, Skill registry, request, policy, exact commit and paths |
| Evidence verification | Implemented for local files | SHA-256 verifies byte identity; source truth and freshness remain separate |
| Signed approvals | Implemented and tested with disposable keys | Ed25519; requires separately operator-provisioned public keys and matching approver |
| Guided form | Implemented in terminal | Produces restrictive submitted intake; classification and authority need review |
| Timeline and review export | Implemented | Per-review packet; UNKNOWN business outcome; no automatic history aggregation |
| First workflow adapter | Local decision review | Actual file-input workflow; synthetic demo is labeled; no external service integration |
| Persistent decision service | Not implemented | No hosting, automatic observation, dispatch or business-action execution |
| Fleet rollout | Not performed | No consumer repositories changed |

Verification: `npm test` or `npm run test:ci`. The latter emits one combined JSON object with regression and operability results; the legacy regression-only command remains available. CI runs the complete check command through its existing npm script. A green local run is not a remote exact-head CI result.

Next operational adoption step: prepare one actual authorized decision and its evidence manifest, inspect the resulting packet, and provision a trusted approval key only if needed. Deployment, permission changes and automatic execution need separate applicable authorization.
