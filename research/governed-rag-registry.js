'use strict';

const crypto = require('node:crypto');

const AUTHENTICATED_REGISTRIES = new WeakSet();
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length ||
      keys.some((key) => typeof key !== 'string' || !expected.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

function canonicalizeRegistryPayload(value) {
  const active = new Set();

  function encode(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') {
      return JSON.stringify(item);
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('registry payload contains a non-finite number');
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) {
      if (active.has(item)) throw new TypeError('registry payload contains a cycle');
      active.add(item);
      const keys = Reflect.ownKeys(item);
      if (keys.some((key) => typeof key !== 'string' ||
          (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)))) {
        throw new TypeError('registry payload contains non-JSON array properties');
      }
      const encoded = [];
      for (let index = 0; index < item.length; index += 1) {
        if (!Object.hasOwn(item, index)) throw new TypeError('registry payload contains a sparse array');
        encoded.push(encode(item[index]));
      }
      active.delete(item);
      return '[' + encoded.join(',') + ']';
    }
    if (!isRecord(item)) throw new TypeError('registry payload must contain only JSON values');
    if (active.has(item)) throw new TypeError('registry payload contains a cycle');
    active.add(item);
    const keys = Reflect.ownKeys(item);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new TypeError('registry payload contains a symbol key');
    }
    keys.sort();
    const pairs = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('registry payload contains a non-JSON property');
      }
      pairs.push(JSON.stringify(key) + ':' + encode(descriptor.value));
    }
    active.delete(item);
    return '{' + pairs.join(',') + '}';
  }

  return encode(value);
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  const match = value.match(/\.(\d{1,3})Z$/);
  const normalized = value.replace(/(?:\.\d{1,3})?Z$/, '.' +
    (match ? match[1].padEnd(3, '0') : '000') + 'Z');
  return new Date(milliseconds).toISOString() === normalized;
}

function validatePayload(payload) {
  const errors = [];
  if (!hasExactKeys(payload, ['registry_id', 'revision', 'issued_at', 'expires_at', 'sources'])) {
    return ['INVALID_REGISTRY_PAYLOAD_SHAPE'];
  }
  if (typeof payload.registry_id !== 'string' || !ID_PATTERN.test(payload.registry_id)) {
    errors.push('INVALID_REGISTRY_ID');
  }
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 1) {
    errors.push('INVALID_REGISTRY_REVISION');
  }
  if (!validTimestamp(payload.issued_at) || !validTimestamp(payload.expires_at)) {
    errors.push('INVALID_REGISTRY_TIMESTAMP');
  } else if (Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
    errors.push('INVALID_REGISTRY_LIFETIME');
  }
  if (!isRecord(payload.sources) || Object.keys(payload.sources).length === 0) {
    errors.push('INVALID_REGISTRY_SOURCES');
    return errors;
  }

  for (const [sourceId, source] of Object.entries(payload.sources)) {
    if (!ID_PATTERN.test(sourceId) ||
        !hasExactKeys(source, [
          'source_id', 'enabled', 'version', 'permission', 'sha256', 'source_updated_at'
        ])) {
      errors.push('INVALID_SOURCE_ENTRY');
      continue;
    }
    if (source.source_id !== sourceId) errors.push('SOURCE_ID_MISMATCH');
    if (typeof source.enabled !== 'boolean') errors.push('INVALID_SOURCE_ENABLED');
    if (typeof source.version !== 'string' || !ID_PATTERN.test(source.version)) {
      errors.push('INVALID_SOURCE_VERSION');
    }
    if (source.permission !== 'approved' && source.permission !== 'denied') {
      errors.push('INVALID_SOURCE_PERMISSION');
    }
    if (typeof source.sha256 !== 'string' || !SHA256_PATTERN.test(source.sha256)) {
      errors.push('INVALID_SOURCE_DIGEST');
    }
    if (!validTimestamp(source.source_updated_at)) errors.push('INVALID_SOURCE_UPDATED_AT');
  }
  return errors;
}

function failedRegistry(reasons, metadata = {}) {
  return Object.freeze({
    verified: false,
    registry_id: metadata.registry_id || null,
    revision: Number.isSafeInteger(metadata.revision) ? metadata.revision : null,
    key_id: metadata.key_id || null,
    reasons: Object.freeze([...new Set(reasons)])
  });
}

function verifySourceRegistryInternal(envelope, options = {}) {
  const reasons = [];
  if (!hasExactKeys(envelope, ['payload', 'signature']) ||
      !hasExactKeys(envelope.signature, ['algorithm', 'key_id', 'value'])) {
    return failedRegistry(['INVALID_REGISTRY_ENVELOPE']);
  }

  const payloadErrors = validatePayload(envelope.payload);
  if (payloadErrors.length) {
    return failedRegistry(payloadErrors, {
      registry_id: envelope.payload?.registry_id,
      revision: envelope.payload?.revision,
      key_id: envelope.signature?.key_id
    });
  }

  if (typeof options.expectedRegistryId !== 'string' ||
      !ID_PATTERN.test(options.expectedRegistryId)) {
    reasons.push('EXPECTED_REGISTRY_ID_REQUIRED');
  } else if (envelope.payload.registry_id !== options.expectedRegistryId) {
    reasons.push('REGISTRY_ID_MISMATCH');
  }
  if (!Number.isSafeInteger(options.minimumRevision) || options.minimumRevision < 1) {
    reasons.push('MINIMUM_REVISION_REQUIRED');
  } else if (envelope.payload.revision < options.minimumRevision) {
    reasons.push('REGISTRY_ROLLBACK');
  }

  const now = options.now === undefined ? new Date() : new Date(options.now);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) reasons.push('INVALID_VERIFICATION_CLOCK');
  else {
    if (Date.parse(envelope.payload.issued_at) > nowMs) reasons.push('REGISTRY_NOT_YET_VALID');
    if (Date.parse(envelope.payload.expires_at) <= nowMs) reasons.push('REGISTRY_EXPIRED');
  }

  const signature = envelope.signature;
  if (signature.algorithm !== 'Ed25519') reasons.push('UNSUPPORTED_SIGNATURE_ALGORITHM');
  if (typeof signature.key_id !== 'string' || !ID_PATTERN.test(signature.key_id)) {
    reasons.push('INVALID_SIGNATURE_KEY_ID');
  }

  const trustedKeys = options.trustedKeys;
  if (!isRecord(trustedKeys)) {
    reasons.push('TRUSTED_KEYRING_REQUIRED');
  } else if (typeof signature.key_id !== 'string' ||
      !Object.hasOwn(trustedKeys, signature.key_id)) {
    reasons.push('UNKNOWN_TRUSTED_KEY');
  }

  let publicKey = null;
  if (isRecord(trustedKeys) && Object.hasOwn(trustedKeys, signature.key_id)) {
    try {
      const configuredKey = trustedKeys[signature.key_id];
      publicKey = configuredKey instanceof crypto.KeyObject
        ? configuredKey
        : crypto.createPublicKey(configuredKey);
      if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') {
        reasons.push('INVALID_TRUSTED_PUBLIC_KEY');
      }
    } catch {
      reasons.push('INVALID_TRUSTED_PUBLIC_KEY');
    }
  }

  let signatureBytes = null;
  if (typeof signature.value !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signature.value)) {
    reasons.push('INVALID_SIGNATURE_ENCODING');
  } else {
    const decoded = Buffer.from(signature.value, 'base64');
    if (decoded.length !== 64 || decoded.toString('base64') !== signature.value) {
      reasons.push('INVALID_SIGNATURE_LENGTH');
    } else {
      signatureBytes = decoded;
    }
  }

  let payloadBytes = null;
  try {
    payloadBytes = Buffer.from(canonicalizeRegistryPayload(envelope.payload), 'utf8');
  } catch {
    reasons.push('INVALID_REGISTRY_CANONICALIZATION');
  }

  if (reasons.length) return failedRegistry(reasons, {
    registry_id: envelope.payload.registry_id,
    revision: envelope.payload.revision,
    key_id: signature.key_id
  });

  let signatureValid = false;
  try {
    signatureValid = crypto.verify(null, payloadBytes, publicKey, signatureBytes);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return failedRegistry(['REGISTRY_SIGNATURE_INVALID'], {
    registry_id: envelope.payload.registry_id,
    revision: envelope.payload.revision,
    key_id: signature.key_id
  });

  const snapshot = JSON.parse(canonicalizeRegistryPayload(envelope.payload));
  const authenticated = Object.freeze({
    verified: true,
    registry_id: snapshot.registry_id,
    revision: snapshot.revision,
    key_id: signature.key_id,
    payload: deepFreeze(snapshot),
    reasons: Object.freeze([])
  });
  AUTHENTICATED_REGISTRIES.add(authenticated);
  return authenticated;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function verifySourceRegistry(envelope, options = {}) {
  try {
    return verifySourceRegistryInternal(envelope, options);
  } catch {
    return failedRegistry(['INVALID_REGISTRY_ENVELOPE']);
  }
}

function isAuthenticatedRegistry(value) {
  return Boolean(value && AUTHENTICATED_REGISTRIES.has(value));
}

module.exports = {
  verifySourceRegistry,
  canonicalizeRegistryPayload,
  isAuthenticatedRegistry
};
