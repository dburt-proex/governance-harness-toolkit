'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifySourceRegistry, canonicalizeRegistryPayload } = require('./governed-rag-registry.js');
const { verifyRetrieval } = require('./governed-rag-provenance.js');

const pair = crypto.generateKeyPairSync('ed25519');
const snippet = 'Hours are 9am to 6pm.';
const digest = crypto.createHash('sha256').update(snippet).digest('hex');
const now = '2026-11-10T12:00:00Z';
const trust = {
  trustedKeys: { 'test-key': pair.publicKey },
  expectedRegistryId: 'faq-registry',
  minimumRevision: 4,
  now
};

function makeEnvelope(source = {}) {
  const payload = {
    registry_id: 'faq-registry',
    revision: 4,
    issued_at: '2026-11-01T00:00:00Z',
    expires_at: '2026-12-01T00:00:00Z',
    sources: {
      approved_faq_v1: {
        source_id: 'approved_faq_v1',
        enabled: true,
        version: 'v1',
        permission: 'approved',
        sha256: digest,
        source_updated_at: '2026-11-09T10:00:00Z',
        ...source
      }
    }
  };
  return {
    payload,
    signature: {
      algorithm: 'Ed25519',
      key_id: 'test-key',
      value: crypto.sign(null, Buffer.from(canonicalizeRegistryPayload(payload)), pair.privateKey).toString('base64')
    }
  };
}

const authenticated = verifySourceRegistry(makeEnvelope(), trust);
const base = {
  source_id: 'approved_faq_v1',
  source_digest: digest,
  source_version: 'v1',
  license_or_permission: 'approved',
  snippet,
  source_updated_at: '2026-11-09T10:00:00Z',
  retrieved_at: '2026-11-10T11:00:00Z'
};
const tamperedEnvelope = makeEnvelope();
tamperedEnvelope.payload.sources.approved_faq_v1.sha256 = 'b'.repeat(64);
const untrustedRegistry = verifySourceRegistry(tamperedEnvelope, trust);
const cases = [
  ['valid signed registry', {}, authenticated, true],
  ['changed content', { snippet: snippet + ' malicious' }, authenticated, false],
  ['forged digest', { source_digest: 'a'.repeat(64) }, authenticated, false],
  ['unknown source', { source_id: 'unknown' }, authenticated, false],
  ['wrong version', { source_version: 'v2' }, authenticated, false],
  ['forged source freshness time', { source_updated_at: '2026-11-10T10:00:00Z' }, authenticated, false],
  ['disallowed rights', { license_or_permission: 'denied' }, authenticated, false],
  ['missing digest', { source_digest: '' }, authenticated, false],
  ['future retrieval', { retrieved_at: '2026-11-11T00:00:00Z' }, authenticated, false],
  ['time inversion', { source_updated_at: '2026-11-10T11:30:00Z' }, authenticated, false],
  ['disabled source', {}, verifySourceRegistry(makeEnvelope({ enabled: false }), trust), false],
  ['tampered signed registry', {}, untrustedRegistry, false],
  ['empty context', { snippet: '' }, authenticated, false],
  ['missing registry', {}, null, false],
  ['invalid updated time', { source_updated_at: 'bad' }, authenticated, false],
  ['normalized invalid calendar date', { source_updated_at: '2026-02-30T00:00:00Z' }, authenticated, false],
  ['prototype-like source ID', { source_id: 'toString' }, authenticated, false],
  ['unsigned registry object', {}, { verified: true, payload: { sources: { approved_faq_v1: {} } } }, false]
];

for (const [name, patch, registry, expected] of cases) {
  const result = verifyRetrieval({ ...base, ...patch }, registry, now);
  assert.equal(result.verified, expected, name);
  if (!expected) assert.ok(result.reasons.length > 0, name);
}
assert.equal(verifyRetrieval(base, authenticated, 'invalid-clock').verified, false);
assert.equal(Object.isFrozen(authenticated.payload), true);
console.log(cases.length + 1 + ' authenticated-provenance fixtures passed');
