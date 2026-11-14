# Decision review: request to retained packet

Purpose: preserve why a decision was made and check its evidence before someone acts. This is an on-demand local workflow; it is not a watcher or hosted service.

## Inputs

1. A real decision record matching `schemas/decision-record.schema.json`. Start from the existing example, replace its example IDs/dates/claims, and retain actual unknowns. Do not copy its approval as real authority.
2. Source files that you are authorized to read. Place them under one evidence root. Give each referenced source one unique `source_id` and canonical relative path.
3. A manifest binding the exact decision-file bytes to those evidence files. Example shape:

```json
{
  "subject_sha256": "REPLACE_WITH_SHA256_OF_EXACT_DECISION_FILE_BYTES",
  "files": [
    {
      "path": "source.md",
      "source_id": "SRC-YOUR-SOURCE-001",
      "sha256": "REPLACE_WITH_SHA256_OF_EXACT_SOURCE_BYTES"
    }
  ]
}
```

The replacement markers above are intentionally invalid until real hashes are inserted. Generate hashes on Windows with:

```powershell
(Get-FileHash -Algorithm SHA256 work/decision.json).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 work/evidence/source.md).Hash.ToLowerInvariant()
```

Manifest paths are relative to the supplied evidence root. Traversal, absolute paths, Windows drive paths, backslashes and paths resolving outside that root are refused. Keep that root under trusted local control while reviewing; this is not an OS sandbox against a hostile concurrent filesystem actor.

## Run

After saving the actual decision, sources and manifest:

```powershell
npm run ght -- review-decision work/decision.json work/manifest.json work/evidence work/review-001.json
npm run ght -- timeline work/review-001.json
npm run ght -- export work/review-001.json work/review-001.md
```

The packet includes purpose, subject hash, review events, record checks, evidence checks, the combined gate and next action. It always records the business outcome as UNKNOWN: reviewing the record did not execute its proposed action. New packets and exports never overwrite previous files.

## Optional authenticated approval

Required approvals remain REVIEW unless a valid signed approval matches the decision's recorded approver. No keys are generated or installed automatically. An operator must provision a trusted public-key file outside untrusted input control:

```json
{"keys":{"owner-key-id":"PEM_PUBLIC_KEY"}}
```

Use an Ed25519 signature. In exact insertion order, serialize with JavaScript `JSON.stringify`:

```javascript
{
  subject_sha256: manifest.subject_sha256,
  files: manifest.files,
  approver: approval.approver,
  expires_at: approval.expires_at,
  key_id: approval.key_id
}
```

Sign the UTF-8 bytes with the operator-controlled private key and encode the signature as base64. Add `approval` with `key_id`, `approver`, `expires_at` (RFC3339), and `signature` to the manifest. Then pass `--trust-store /path/to/operator-public-keys.json`. Never put private keys in the repository, manifest or review packet. Reordering the signed files or editing their metadata requires a new signature.

The trust store is an explicit host trust input. An agent or untrusted request must not select or modify its own trusted keys. Key provisioning, rotation and revocation remain owner-controlled. A valid signature proves possession of the trusted key; it cannot prove the human understood the decision, the claims are true, or the signer still holds authority beyond the recorded scope. No externally hosted identity provider is integrated here.

## What to verify personally

- The named evidence actually supports the decision, rather than merely matching its stored hash.
- Source freshness/authority claims are justified. The adapter does not query a live source registry.
- The operator-trusted key belongs to the intended approver.
- The next execution boundary independently enforces permissions.
- Final packet files are backed up in the approved destination.

The automated tests exercise changed evidence, subject substitution, signature tampering, expiry, unknown signer, path escapes, malformed records, source-ID gaps and refused overwrite. Test data and keys are disposable and make no claims about live approvals.
