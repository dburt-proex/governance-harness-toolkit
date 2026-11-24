# GHT-RAG-007 — Receipt-bound outcome validation (2026-11-24)

Scope: offline and synthetic research only. Branch: `research/governed-rag-preflight-20261105`. Does not authorize execution, merge, publication, or deployment.

## Implementation
- `research/governed-rag-outcome-receipts.js`: separate Ed25519 signature verification for execution receipt and independent evaluator-signed outcome evidence; exact-shape envelopes, pinned execution/request/commit/policy binding, evidence digest re-computation, freshness checks, signed action trace tool allowlist, replay preflight against trusted caller-provided ledger, and fail-closed HALT/REVIEW behavior.
- `research/governed-rag-outcome-receipts.test.js`: synthetic tampering, forged identity, replay, missing evidence, policy mismatch, unauthorized action, and outcome threshold fixtures.
- `run-regression.js`: include the new receipt suite in the canonical runner.

## Reproduction
```sh
node research/governed-rag-outcome-receipts.test.js
npm test
npm run test:ci
```
Isolated local reconstruction on Node v22.16.0: 38/38 test assertions passed; full repository dependencies unavailable in that environment, so canonical full-suite results must come from GitHub Actions.

## Security boundaries / limitations
- Separate pinned runtime and evaluator public keys must be provisioned outside untrusted receipts; this prototype does not perform key lifecycle management or independently attest a live executor.
- Caller supplies the trusted execution-to-request map, exact commit pin, trusted clock, trusted tool allowlist and persistent replay ledger. An untrusted caller must not be allowed to set these values.
- A valid signature proves the signer attested to labels and usage; it does not prove that grounding labels, billing measurements, citation truth, or action-log completeness are correct. Those require independent evaluation and telemetry collectors.
- Offline PASS remains a performance/evidence verdict, **never** canonical GHT execution ALLOW.
- Results contain no raw customer data, secrets or external side effects.
- GitHub CI and exact final review-branch SHA to be recorded in a separate review/CI receipt after checks complete; no claim of CI success here.

## Next gate
Verify exact-head CI and independent review before proposing a protected-branch merge. No merge/deployment without owner approval.
