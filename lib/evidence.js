'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function containedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative)) throw Error('Evidence path must be a canonical relative file');
  const base = fs.realpathSync(root);
  const target = fs.realpathSync(path.resolve(base, relative));
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.statSync(target).isFile()) throw Error('Evidence escapes root or is not a file');
  return target;
}
function verify(manifest, root, subjectBytes, trustStore = null, asOf = new Date().toISOString()) {
  const failures = [];
  const reviews = [];
  const checked = [];
  const {errors} = require('./validation');
  failures.push(...errors('evidence-manifest', manifest));
  if (failures.length) return {computed_gate:'HALT', failures, reviews, checked};
  if (manifest.subject_sha256 !== digest(subjectBytes)) failures.push('Manifest is not bound to the evaluated input bytes');
  const paths = manifest.files.map(f=>f.path);
  const sources = manifest.files.filter(f=>f.source_id).map(f=>f.source_id);
  if (new Set(paths).size !== paths.length || new Set(sources).size !== sources.length) failures.push('Evidence paths and source IDs must be unique');
  for (const item of manifest.files) {
    try {
      const actual = digest(fs.readFileSync(containedFile(root,item.path)));
      checked.push({path:item.path,sha256:actual,matched:actual===item.sha256});
      if (actual !== item.sha256) failures.push(`Evidence changed: ${item.path}`);
    } catch (e) { failures.push(`Cannot verify ${item.path}: ${e.message}`); }
  }
  let approvalVerified = false;
  if (manifest.approval) {
    const a = manifest.approval;
    const key = trustStore?.keys?.[a.key_id];
    if (!key) reviews.push('Approval signer has no operator-trusted public key');
    else {
      try {
        if (crypto.createPublicKey(key).asymmetricKeyType !== 'ed25519') throw Error('Ed25519 approval key required');
        const payload = JSON.stringify({subject_sha256:manifest.subject_sha256,files:manifest.files,approver:a.approver,expires_at:a.expires_at,key_id:a.key_id});
        if (!Number.isFinite(Date.parse(asOf)) || Date.parse(asOf)>=Date.parse(a.expires_at)) failures.push('Approval expired or evaluation time invalid');
        else if (!crypto.verify(null,Buffer.from(payload),key,Buffer.from(a.signature,'base64'))) failures.push('Approval signature invalid');
        else approvalVerified = true;
      } catch(e) {failures.push('Approval key or signature invalid');}
    }
  }
  if (!manifest.files.length) reviews.push('No independently checked evidence files');
  return {computed_gate:failures.length?'HALT':reviews.length?'REVIEW':'ALLOW',failures,reviews,checked,approval_verified:approvalVerified,limits:'Hashes verify bytes; signatures verify possession of an operator-trusted key, not truth or human intent.'};
}
module.exports={verify,digest,containedFile};
