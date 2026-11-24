# GHT-RAG-005 — Adversarial registry validation and regression wiring

Date: 2026-11-17  
Scope: `research/governed-rag-preflight-20261105` only  
Status: **Adversarial suite locally passed; full repository CI remains unverified**.

## Exact reviewed inputs

- `research/governed-rag-registry.js`: Git blob SHA `3d006787bbf13162a32213b6b6e507871263bf27`
- `research/governed-rag-registry-adversarial.test.js`: Git blob SHA `f702237fbc53844599b18fd4fd73ab77a6cbc90b`
- Both files were read from GitHub and reconstructed in an isolated, offline local directory. `git hash-object` for each local file exactly matched its GitHub blob SHA before executing Node.
- Runtime: Node.js v22.16.0, Linux; no dependencies, model calls, network requests, customer data, or external actions.

## Commands and observed output

```sh
git hash-object research/governed-rag-registry.js
# 3d006787bbf13162a32213b6b6e507871263bf27
git hash-object research/governed-rag-registry-adversarial.test.js
# f702237fbc53844599b18fd4fd73ab77a6cbc90b
node research/governed-rag-registry-adversarial.test.js
# 15 adversarial registry fixtures + immutable/authentication assertions passed
node --check research/governed-rag-registry.js
node --check research/governed-rag-registry-adversarial.test.js
# exit 0 for both syntax checks
```

15/15 adversarial fixture cases passed; four additional immutable/authentication assertions also passed. No failure required a product-code fix.

## Repository change

`run-regression.js` now includes `research/governed-rag-registry-adversarial.test.js` in `runGovernedRagTests()`. Commit: `7a6fcfd25c2d691e107d2023b296573a053d559c`. Verified the updated file on the review branch via GitHub readback.

This fixes a material CI coverage omission: before the change, `npm test` and `npm run test:ci` did **not** invoke the new adversarial test.

## Incomplete independent evidence

The full repository regression suite (`npm test` and `npm run test:ci`) was **not** executed in this session. The working environment lacked a network-accessible GitHub checkout and npm dependencies. The earlier GHT-RAG-004 receipt reported 151 passing cases against an older branch state; that does not prove the current head passes. The GitHub Actions `ci.yml` workflow triggers only on pushes to `main` and pull requests targeting `main`. The GitHub Actions API returned zero workflow runs for this research branch. Do not label current CI green.

Reproduction from a checked-out branch with dependency installation available:

```sh
git checkout research/governed-rag-preflight-20261105
npm ci
node research/governed-rag-registry-adversarial.test.js
npm test
npm run test:ci
```

Save the exact run URL, tested commit SHA, Node/npm versions, test counts, and logs. A draft pull request targeting `main` could trigger existing CI, but opening one was not authorized here.

## Security caveats and next gate

Passing synthetic tests does not establish deployment readiness. Cryptographic authenticity depends on a trusted, independently pinned public key, revision floor, and clock. Signed source metadata is not evidence of accuracy, privacy compliance, or authorization of external actions. No merge, deployment, publication, permission change, or outreach occurred.

Next: run full CI on the exact review-branch head, capture proof, investigate failures, and obtain owner authorization before any merge or deployment.
