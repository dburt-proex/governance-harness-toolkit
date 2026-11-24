'use strict';

const crypto = require('node:crypto');
const { isAuthenticatedRegistry } = require('./governed-rag-registry.js');

const HEX = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function validTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  const match = value.match(/\.(\d{1,3})Z$/);
  const normalized = value.replace(/(?:\.\d{1,3})?Z$/, '.' +
    (match ? match[1].padEnd(3, '0') : '000') + 'Z');
  return new Date(milliseconds).toISOString() === normalized;
}

function verifyRetrievalInternal(record, authenticatedRegistry, now = new Date()) {
  const reasons = [];
  const fail = (code) => reasons.push(code);

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { verified: false, reasons: ['INVALID_RECORD'] };
  }
  if (!isAuthenticatedRegistry(authenticatedRegistry)) {
    return { verified: false, reasons: ['REGISTRY_NOT_AUTHENTICATED'] };
  }

  const sources = authenticatedRegistry.payload.sources;
  if (typeof record.source_id !== 'string' || !SOURCE_ID.test(record.source_id)) {
    fail('INVALID_SOURCE_ID');
  }
  const entry = typeof record.source_id === 'string' && Object.hasOwn(sources, record.source_id)
    ? sources[record.source_id]
    : null;
  if (!entry || entry.enabled !== true) fail('SOURCE_NOT_REGISTERED');
  if (typeof record.snippet !== 'string' || !record.snippet.trim()) fail('INVALID_SNIPPET');
  if (typeof record.source_digest !== 'string' || !HEX.test(record.source_digest)) {
    fail('INVALID_DIGEST_FORMAT');
  }
  if (typeof record.snippet === 'string' && HEX.test(record.source_digest || '')) {
    const computed = crypto.createHash('sha256').update(record.snippet, 'utf8').digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(record.source_digest, 'hex'))) {
      fail('DIGEST_MISMATCH');
    }
  }
  if (entry) {
    if (record.source_version !== entry.version) fail('SOURCE_VERSION_MISMATCH');
    if (record.source_updated_at !== entry.source_updated_at) fail('SOURCE_UPDATE_TIME_MISMATCH');
    if (record.license_or_permission !== entry.permission || entry.permission !== 'approved') {
      fail('SOURCE_RIGHTS');
    }
    if (record.source_digest !== entry.sha256) fail('REGISTRY_DIGEST_MISMATCH');
  }

  const updated = validTimestamp(record.source_updated_at) ? Date.parse(record.source_updated_at) : NaN;
  const retrieved = validTimestamp(record.retrieved_at) ? Date.parse(record.retrieved_at) : NaN;
  const current = new Date(now).getTime();
  if (!Number.isFinite(current) || !Number.isFinite(updated) || !Number.isFinite(retrieved) ||
      updated > retrieved || retrieved > current) {
    fail('INVALID_TIMESTAMPS');
  }
  return { verified: reasons.length === 0, reasons };
}

function verifyRetrieval(record, authenticatedRegistry, now = new Date()) {
  try {
    return verifyRetrievalInternal(record, authenticatedRegistry, now);
  } catch {
    return { verified: false, reasons: ['INVALID_RECORD'] };
  }
}

module.exports = { verifyRetrieval };
