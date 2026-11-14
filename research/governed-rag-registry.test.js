'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const registrySchema = require('../schemas/governed-rag-source-registry.schema.json');
const {
  verifySourceRegistry,
  canonicalizeRegistryPayload
} = require('./governed-rag-registry.js');

const pair = crypto.generateKeyPairSync('ed25519');
const now = '2026-11-14T12:00:00Z';
const trustedKeys = { 'trusted-key': pair.publicKey };
const context = {
  trustedKeys,
  expectedRegistryId: 'faq-registry',
  minimumRevision: 7,
  now
};
const schemaValidator = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false
});
addFormats(schemaValidator);
const validateEnvelope = schemaValidator.compile(registrySchema);

function payload(overrides = {}) {
  return {
    registry_id: 'faq-registry',
    revision: 7,
    issued_at: '2026-11-14T00:00:00Z',
    expires_at: '2026-11-15T00:00:00Z',
    sources: {
      approved_faq_v1: {
        source_id: 'approved_faq_v1',
        enabled: true,
        version: 'v1',
        permission: 'approved',
        sha256: 'a'.repeat(64),
        source_updated_at: '2026-11-14T00:00:00Z'
      }
    },
    ...overrides
  };
}

function signedEnvelope(document = payload(), keyId = 'trusted-key', signingKey = pair.privateKey) {
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalizeRegistryPayload(document), 'utf8'),
    signingKey
  ).toString('base64');
  return {
    payload: document,
    signature: { algorithm: 'Ed25519', key_id: keyId, value: signature }
  };
}

const tamperedPayload = signedEnvelope();
tamperedPayload.payload.sources.approved_faq_v1.enabled = false;
const corruptSignature = signedEnvelope();
corruptSignature.signature.value =
  (corruptSignature.signature.value[0] === 'A' ? 'B' : 'A') +
  corruptSignature.signature.value.slice(1);
const hiddenEnvelopeField = signedEnvelope();
Object.defineProperty(hiddenEnvelopeField, 'shadow', { value: true });
const replacementSigner = crypto.generateKeyPairSync('ed25519');
const substitutedKey = signedEnvelope(payload(), 'trusted-key', replacementSigner.privateKey);
const cases = [
  ['valid pinned signature', signedEnvelope(), context, ''],
  ['payload tampering', tamperedPayload, context, 'REGISTRY_SIGNATURE_INVALID'],
  ['corrupt signature', corruptSignature, context, 'REGISTRY_SIGNATURE_INVALID'],
  ['unknown signing key', signedEnvelope(payload(), 'attacker-key'), context, 'UNKNOWN_TRUSTED_KEY'],
  ['signature key substitution', substitutedKey, context, 'REGISTRY_SIGNATURE_INVALID'],
  ['wrong algorithm', {
    ...signedEnvelope(),
    signature: { ...signedEnvelope().signature, algorithm: 'RSA-SHA256' }
  }, context, 'UNSUPPORTED_SIGNATURE_ALGORITHM'],
  ['future issue time', signedEnvelope(payload({
    issued_at: '2026-11-15T00:00:00Z',
    expires_at: '2026-11-16T00:00:00Z'
  })), context, 'REGISTRY_NOT_YET_VALID'],
  ['expired registry', signedEnvelope(payload({ expires_at: '2026-11-14T11:59:59Z' })), context, 'REGISTRY_EXPIRED'],
  ['revision rollback', signedEnvelope(), { ...context, minimumRevision: 8 }, 'REGISTRY_ROLLBACK'],
  ['registry identity mismatch', signedEnvelope(), { ...context, expectedRegistryId: 'other-registry' }, 'REGISTRY_ID_MISMATCH'],
  ['missing rollback floor', signedEnvelope(), { ...context, minimumRevision: undefined }, 'MINIMUM_REVISION_REQUIRED'],
  ['unknown payload field', signedEnvelope(payload({ extra: true })), context, 'INVALID_REGISTRY_PAYLOAD_SHAPE'],
  ['normalized invalid calendar date', signedEnvelope(payload({
    issued_at: '2026-02-30T00:00:00Z',
    expires_at: '2026-03-02T00:00:00Z'
  })), context, 'INVALID_REGISTRY_TIMESTAMP'],
  ['source identifier mismatch', signedEnvelope(payload({
    sources: { approved_faq_v1: { ...payload().sources.approved_faq_v1, source_id: 'other-id' } }
  })), context, 'SOURCE_ID_MISMATCH'],
  ['invalid source digest', signedEnvelope(payload({
    sources: { approved_faq_v1: { ...payload().sources.approved_faq_v1, sha256: 'z'.repeat(64) } }
  })), context, 'INVALID_SOURCE_DIGEST'],
  ['hidden envelope field', hiddenEnvelopeField, context, 'INVALID_REGISTRY_ENVELOPE']
];
assert.equal(validateEnvelope(signedEnvelope()), true, 'valid signed envelope matches its schema');
const wrongSignatureAlgorithm = signedEnvelope();
wrongSignatureAlgorithm.signature.algorithm = 'RSA-SHA256';
assert.equal(validateEnvelope(wrongSignatureAlgorithm), false, 'unsupported algorithm fails its schema');

for (const [name, envelope, options, expectedReason] of cases) {
  const result = verifySourceRegistry(envelope, options);
  if (name === 'valid pinned signature') {
    assert.equal(result.verified, true, name);
    assert.equal(result.registry_id, 'faq-registry', name);
    assert.equal(result.revision, 7, name);
    assert.equal(Object.isFrozen(result.payload.sources.approved_faq_v1), true, name);
  } else {
    assert.equal(result.verified, false, name);
    assert.ok(result.reasons.includes(expectedReason), name + ': ' + result.reasons.join(','));
  }
}
const orderedPayload = payload();
const signedOrdered = signedEnvelope(orderedPayload);
const reorderedPayload = Object.fromEntries(Object.entries(orderedPayload).reverse());
reorderedPayload.sources = Object.fromEntries(
  Object.entries(orderedPayload.sources).reverse().map(([id, source]) => [
    id,
    Object.fromEntries(Object.entries(source).reverse())
  ])
);
assert.equal(
  verifySourceRegistry({ ...signedOrdered, payload: reorderedPayload }, context).verified,
  true,
  'signature verification is independent of JSON property ordering'
);
assert.throws(() => canonicalizeRegistryPayload({ value: undefined }), /JSON values/);
const cyclic = {};
cyclic.self = cyclic;
assert.throws(() => canonicalizeRegistryPayload(cyclic), /cycle/);
console.log(cases.length + 5 + ' signed-registry adversarial fixtures passed');
