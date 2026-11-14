'use strict';
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const ajv = new Ajv({allErrors: true, strict: false});
addFormats(ajv);
const cache = new Map();
function errors(schemaName, value) {
  if (!cache.has(schemaName)) cache.set(schemaName, ajv.compile(require('../schemas/' + schemaName + '.schema.json')));
  const validate = cache.get(schemaName);
  return validate(value) ? [] : validate.errors.map(e => `${e.instancePath || '/'}: ${e.message}`);
}
function guard(fn, inputs) {
  return (...args) => {
    const failures = inputs.flatMap(([index, schema]) => errors(schema, args[index]).map(e => `argument ${index + 1} ${e}`));
    if (failures.length) return {computed_gate: 'HALT', execution_state: 'HALT', release_gate: 'HALT', effective_gate: 'HALT', gate: 'HALT', verdict: 'FAIL', record_verdict: 'FAIL', conformance_verdict: 'FAIL', route_verdict: 'FAIL', policy_verdict: 'FAIL', final_eligible: false, violations: failures, failures, record_failures: failures, findings: failures.map(message => ({code: 'INPUT_INVALID', gate: 'HALT', message}))};
    return fn(...args);
  };
}
module.exports = {errors, guard};
