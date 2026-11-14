# GHT-RAG-004 — Trusted Retrieval and Execution Governance

**Status:** Implemented and locally validated on review branch `research/governed-rag-preflight-20261105`.  
**Observed parent:** `20c349d1ac91b54be58d79af409141f1d1760645` (2026-11-12).  
**Scope:** Offline/synthetic R&D only. No merge, release, production deployment, external action, permission change, or spend.

## Delivered

- Added a strict signed source-registry schema and verifier. The Ed25519 signature covers deterministic, recursively key-sorted JSON. Verification requires a public key pinned outside the envelope, an expected registry ID, a minimum accepted revision, and a trusted current time.
- Bound source ID, enablement, version, rights state, exact snippet SHA-256, and source update time to the signed registry. Unauthenticated registry objects and altered source metadata fail closed.
- Connected retrieval outcomes to the canonical workflow input-trust evaluator and policy. The adapter validates the canonical workflow request schema, passes the retrieval as `external_web_content`, and combines RAG and GHT gates using the more restrictive decision.
- Preserved the caller's canonical authority grants and declared gate. The RAG adapter does not add action authority and does not execute actions.
- Expanded the repository regression runner to include signed-registry, provenance, preflight, and GHT integration tests.

## Reproduction and results

Run from the repository root:

```sh
npm test
npm run test:ci
```

Observed runtime: Node.js `v24.16.0`, npm `11.13.0`, Ajv `8.20.0`.

- Full repository suite: **151 passed, 0 failed**.
- RAG-specific fixtures: **75 passed** (21 signed-registry, 19 provenance, 15 preflight, 20 integrated GHT).
- Both the human-readable and JSON CI runner modes passed.

The branch's full runner, test inputs, schemas, evaluators, and RAG baseline were tested in an isolated local source mirror based on the observed branch tree at the parent SHA above. Git fetch could not resolve `github.com`; unchanged files were taken from a clean local clone whose Git blob IDs matched the observed branch tree, and differing branch files were read through the GitHub repository connector. The preinstalled Ajv version matches the package manifest; no dependency installation or network-dependent test ran.

## Limits and risks

- Authenticity is only as strong as the independently provisioned public-key pin, expected registry ID, minimum revision, and trusted clock. The retrieval adapter must stamp `retrieved_at` from its trusted clock.
- The registry binds an exact snippet and signed source metadata. It does not establish legal rights, source completeness, factual correctness, privacy suitability, or production readiness.
- The retrieval thresholds and fixture examples remain synthetic. No live retriever, customer data, deployment, or production behavior was tested.

## Next gate and recovery

Before any pilot, review key provisioning and rotation, the rights-evidence model, retrieval-clock ownership, and operational thresholds; then run CI and obtain independent review on this branch. Merge or deployment remains a separate decision.

If review finds a defect, revert the resulting branch commit with `git revert <commit-sha>`; no force reset is required.
