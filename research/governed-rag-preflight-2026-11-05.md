# Governed RAG preflight — research increment (2026-11-05)

Status: **research implementation; offline/synthetic tests only, not production enforcement**. Intended pilot: local-service intake/FAQ assistant. No outbound messages, bookings, or external effects.

## Trusted source-registry contract

A registry envelope contains a strict payload and an Ed25519 signature over the payload's deterministic, recursively key-sorted JSON representation. The verifier rejects unknown fields, malformed values, invalid signatures, unknown key IDs, future-issued or expired registries, and revisions below an independently configured floor.

The verification keyring, expected registry ID, minimum accepted revision, and clock must be supplied by trusted deployment configuration outside the retrieved registry and RAG context. A key ID in the envelope does not establish trust. If an attacker can change both the registry and pinned public key, signature verification provides no authenticity. The caller must provision and protect those values and advance the revision floor through its trusted control plane.

Each signed source entry binds a source ID, enabled state, version, permission state, SHA-256 digest, and source update time. Retrieval verification checks that the registry itself was authenticated and that the exact retrieved snippet matches the approved digest, version, source ID, rights, and signed update time. The retrieval adapter must stamp \`retrieved_at\` from its trusted clock; an arbitrary caller-supplied timestamp is not authenticated by this registry contract. This contract does not prove that the source was lawful, complete, or safely collected; it proves only that the signed registry authorized this exact content under its recorded metadata.

## GHT execution gating

The integrated evaluator requires a schema-valid canonical GHT workflow request and passes a provenance-bearing `external_web_content` input to `evaluators/workflow-execution-trust.js` under `policies/workflow-execution-input-trust.json`. A RAG result other than ALLOW marks the retrieved material as unavailable trusted context for the canonical gate, so GHT routes it to REVIEW or HALT. The final gate is the most restrictive RAG/GHT result; a GHT conformance failure becomes HALT.

The adapter preserves the supplied authority grants and declared gate. Retrieved content is never treated as an authoritative instruction, and the RAG layer adds no execute, edit, network, GitHub-write, credential, permission, merge, or deploy authority. The evaluator only returns a decision; it performs no action.

## Offline conformance fixtures

The initial score, freshness, context-length, tool, and source parameters remain test values, not validated operational thresholds. Fixtures cover signature tampering and substitution, unknown signing keys, expiry, rollback, source metadata, retrieved-content tampering, injection attempts, canonical authority escalation, and GHT REVIEW/HALT propagation.

## Risks and next gate

Authenticity depends on independently pinned Ed25519 public keys, registry identity, revision floor, and a trusted clock. Digest binding covers the exact retrieved snippet in this prototype; a production design should also capture immutable source versions, source retrieval receipts, rights evidence, privacy/retention rules, and key rotation/revocation procedures. Validate thresholds and operational controls before any customer pilot. This work is not a compliance certification or legal determination.

Next gate: review key provisioning and the source/rights evidence model, then independently review this branch's fixtures and CI results. No merge, release, or production deployment is included.
