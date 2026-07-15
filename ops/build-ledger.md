# Toolkit Build Ledger

## Run 001

- Date: 2026-07-15
- Scope: Complete TK-001 by defining the governed source record and regression cases
- Evidence:
  - governance/build-contract.md
  - ops/backlog.md
  - Toolkit research brief requirement for authority, provenance, freshness, and eligibility controls
- Artifacts:
  - schemas/source-record.schema.json
  - fixtures/source-record/regression-cases.json
  - ops/backlog.md
  - ops/build-ledger.md
- Controls implemented:
  - Authority tier and role
  - Source ownership and allowed-use boundaries
  - Content provenance and SHA-256 field
  - Freshness window, review date, and freshness state
  - Decision eligibility and lifecycle state
  - Closed object schemas to reject undocumented fields
- Verification:
  - Validator: Ajv 8, JSON Schema Draft 2020-12 with format validation
  - current-authoritative-final: PASS
  - expired-source-blocked: PASS
  - missing-freshness-rejected: PASS
  - Result: 3/3 regression cases passed
- Failure handling:
  - Python jsonschema dependency was unavailable
  - Verification moved to an isolated Ajv installation without adding a repository runtime dependency
- Result: PASS, TK-001 complete
- Confidence: High for structural validation; medium for policy completeness
- Open risks:
  - Cross-field date and eligibility coherence requires a policy evaluator beyond JSON Schema
  - The registry persistence layer is not implemented
  - Fixture hashes are synthetic test values
- Next action: TK-002, define the governed intake record with valid and invalid examples
- Approval state: Schema and fixtures approved for controlled use; executable enforcement remains gated by a future evaluator

## Run 000

- Date: 2026-07-15
- Scope: Establish governed build contract, backlog, and scheduled compounding loop
- Evidence: Project objective, Toolkit research brief, current repository state
- Artifacts:
  - governance/build-contract.md
  - ops/backlog.md
  - ops/build-ledger.md
- Result: PASS, foundation seeded
- Confidence: High for control structure, low for implementation completeness
- Open risks:
  - Core workflow schemas are not implemented
  - No regression fixture set exists yet
  - Canonical Notion operational views are not connected
- Next action: TK-001, source registry schema and freshness states
- Approval state: Documentation foundation approved; executable implementation remains gated by tests and review
