#!/usr/bin/env node
'use strict';

const fs = require('fs');

const GATE_RANK = { ALLOW: 0, REVIEW: 1, HALT: 2 };
const EXPECTED = {
  policyId: 'POL-AGENT-PLUGIN-MCP-GOV-1',
  policyVersion: '1.0.0',
  profileName: 'agent-plugins-1.0-mcp-governance',
  profileStatus: 'toolkit_defined',
  agentPluginsProfile: 'toolkit-agent-plugins-1.0',
  agentPluginsSnapshot: '2026-08-23',
  mcpProtocolVersion: '2026-07-28',
  manifestPath: '.codex-plugin/plugin.json',
  annotations: ['readOnlyHint', 'destructiveHint', 'openWorldHint'],
  prohibitedInputFields: [
    'conversation_history',
    'full_conversation',
    'raw_chat_transcript',
    'chat_transcript',
    'message_history',
    'access_token',
    'refresh_token',
    'api_key',
    'password',
    'secret'
  ],
  prohibitedAutomatedOperations: ['permission_change', 'financial_transaction'],
  writeOperations: ['create', 'update', 'delete', 'send', 'publish'],
  destructiveOperations: ['delete', 'permission_change', 'financial_transaction'],
  operationAuthority: {
    read: 'read',
    search: 'search',
    create: 'edit',
    update: 'edit',
    delete: 'edit',
    send: 'network',
    publish: 'network',
    execute: 'execute',
    permission_change: 'permission',
    financial_transaction: 'credential'
  }
};

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validatePolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['policy must be an object'];
  if (policy.policy_id !== EXPECTED.policyId) errors.push(`policy_id must be ${EXPECTED.policyId}`);
  if (policy.version !== EXPECTED.policyVersion) errors.push(`version must be ${EXPECTED.policyVersion}`);
  if (policy.default_gate !== 'REVIEW') errors.push('default_gate must be REVIEW');
  if (policy.profile?.name !== EXPECTED.profileName) errors.push(`profile.name must be ${EXPECTED.profileName}`);
  if (policy.profile?.status !== EXPECTED.profileStatus) errors.push(`profile.status must be ${EXPECTED.profileStatus}`);
  if (policy.profile?.agent_plugins_profile !== EXPECTED.agentPluginsProfile) {
    errors.push(`profile.agent_plugins_profile must be ${EXPECTED.agentPluginsProfile}`);
  }
  if (policy.profile?.agent_plugins_documentation_snapshot !== EXPECTED.agentPluginsSnapshot) {
    errors.push(`profile.agent_plugins_documentation_snapshot must be ${EXPECTED.agentPluginsSnapshot}`);
  }
  if (policy.profile?.mcp_protocol_version !== EXPECTED.mcpProtocolVersion) {
    errors.push(`profile.mcp_protocol_version must be ${EXPECTED.mcpProtocolVersion}`);
  }
  if (policy.required_manifest_path !== EXPECTED.manifestPath) {
    errors.push(`required_manifest_path must be ${EXPECTED.manifestPath}`);
  }
  if (!sameValue(policy.required_tool_annotations, EXPECTED.annotations)) {
    errors.push('required_tool_annotations must preserve the canonical ordered set');
  }
  if (!sameValue(policy.prohibited_input_fields, EXPECTED.prohibitedInputFields)) {
    errors.push('prohibited_input_fields must preserve the canonical ordered set');
  }
  if (!sameValue(policy.prohibited_automated_operations, EXPECTED.prohibitedAutomatedOperations)) {
    errors.push('prohibited_automated_operations must preserve the canonical ordered set');
  }
  if (!sameValue(policy.write_operations, EXPECTED.writeOperations)) {
    errors.push('write_operations must preserve the canonical ordered set');
  }
  if (!sameValue(policy.destructive_operations, EXPECTED.destructiveOperations)) {
    errors.push('destructive_operations must preserve the canonical ordered set');
  }
  if (!sameValue(policy.operation_authority, EXPECTED.operationAuthority)) {
    errors.push('operation_authority must preserve the canonical mapping');
  }
  return errors;
}

function normalizeFieldName(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function visitSchemaProperties(node, visitor, path = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    for (const [name, definition] of Object.entries(node.properties)) {
      visitor(name, definition, [...path, name]);
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties') {
      for (const [name, definition] of Object.entries(value || {})) {
        visitSchemaProperties(definition, visitor, [...path, name]);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visitSchemaProperties(item, visitor, path);
    } else {
      visitSchemaProperties(value, visitor, path);
    }
  }
}

function isSafeComponentPath(value) {
  if (typeof value !== 'string' || !value.startsWith('./') || value.includes('\0')) return false;
  return !value.replace(/\\/g, '/').split('/').includes('..');
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function evaluate(policy, record) {
  const findings = [];
  const add = (gate, code, detail, tool = null) => {
    const finding = { gate, code, detail };
    if (tool) finding.tool = tool;
    findings.push(finding);
  };

  const policyErrors = validatePolicy(policy);
  for (const detail of policyErrors) add('HALT', 'invalid_policy', detail);

  const policyProfile = policy?.profile || {};
  const writeOperations = Array.isArray(policy?.write_operations) ? policy.write_operations : [];
  const destructiveOperations = Array.isArray(policy?.destructive_operations) ? policy.destructive_operations : [];
  const prohibitedInputFields = Array.isArray(policy?.prohibited_input_fields) ? policy.prohibited_input_fields : [];
  const prohibitedAutomatedOperations = Array.isArray(policy?.prohibited_automated_operations)
    ? policy.prohibited_automated_operations
    : [];
  const operationAuthority = policy?.operation_authority || {};

  if (record.profile_version !== policy?.version) {
    add('HALT', 'profile_version_mismatch', `record profile ${record.profile_version} does not match policy ${policy?.version || '<missing>'}`);
  }
  if (record.upstream.agent_plugins.profile !== policyProfile.agent_plugins_profile ||
      record.upstream.agent_plugins.documentation_snapshot !== policyProfile.agent_plugins_documentation_snapshot) {
    add('HALT', 'agent_plugins_pin_mismatch', 'Agent Plugins profile or documentation snapshot does not match the compatibility pack');
  }
  if (record.upstream.mcp.protocol_version !== policyProfile.mcp_protocol_version) {
    add('HALT', 'mcp_version_mismatch', `MCP ${record.upstream.mcp.protocol_version} is outside the pinned ${policyProfile.mcp_protocol_version} profile`);
  }
  if (!record.upstream.agent_plugins.source_url.startsWith('https://developers.openai.com/plugins/')) {
    add('REVIEW', 'agent_plugins_source_unverified', 'Agent Plugins evidence is not an official developers.openai.com/plugins URL');
  }
  if (!record.upstream.mcp.source_url.startsWith('https://modelcontextprotocol.io/specification/')) {
    add('REVIEW', 'mcp_source_unverified', 'MCP evidence is not an official specification URL');
  }

  if (record.package.manifest_path !== policy?.required_manifest_path) {
    add('HALT', 'invalid_manifest_path', `manifest must be ${policy?.required_manifest_path || EXPECTED.manifestPath}`);
  }
  for (const componentPath of record.package.component_paths) {
    if (!isSafeComponentPath(componentPath)) {
      add('HALT', 'component_path_escape', `component path must be ./-relative and remain inside the plugin root: ${componentPath}`);
    }
  }
  if (!record.package.has_mcp_server) {
    add('HALT', 'mcp_server_missing', 'a compatibility record with discovered tools must identify its MCP server component');
  }
  if (record.package.has_hooks) {
    add('REVIEW', 'plugin_hooks_require_trust_review', 'plugin hooks remain untrusted until their current definitions receive explicit review');
  }

  const server = record.server;
  const auth = server.authentication;
  if (server.transport === 'streamable_http' && !isHttpsUrl(server.endpoint)) {
    add('HALT', 'insecure_remote_transport', 'remote MCP servers require a stable HTTPS endpoint');
  }
  if (server.transport === 'stdio') {
    add('REVIEW', 'local_server_execution_review', 'stdio starts local code and requires an exact-command, sandbox, filesystem, and network review');
  }
  if (auth.mode === 'environment' && server.transport !== 'stdio') {
    add('HALT', 'invalid_environment_auth_transport', 'environment credential retrieval is limited to stdio in this profile');
  }
  if (auth.mode === 'oauth_2_1' && (
    auth.scopes.length === 0 || !auth.scopes_enforced_each_call || !auth.audience_validated
  )) {
    add('HALT', 'oauth_controls_missing', 'OAuth requires minimal scopes, per-call scope enforcement, and audience validation');
  }
  if (auth.token_passthrough) {
    add('HALT', 'token_passthrough_prohibited', 'token passthrough crosses the MCP token-audience boundary');
  }
  if (!server.input_validation) add('HALT', 'server_input_validation_missing', 'MCP servers must validate every tool input');
  if (!server.output_sanitization) add('HALT', 'server_output_sanitization_missing', 'MCP servers must sanitize tool outputs');
  if (!server.rate_limit) add('HALT', 'server_rate_limit_missing', 'MCP servers must rate limit tool invocations');

  const names = new Set();
  let hasExternalEffect = false;
  let hasWriteOrHighRisk = false;
  let hasSensitiveData = false;
  for (const tool of record.tools) {
    const name = tool.name;
    const operation = tool.behavior.operation;
    const annotations = tool.annotations;
    const enforcement = tool.enforcement;
    const isReadOnly = operation === 'read' || operation === 'search';
    const isWrite = writeOperations.includes(operation);
    const isDestructive = destructiveOperations.includes(operation);
    const isHighRisk = isWrite || isDestructive || operation === 'execute' || tool.behavior.external_effect;
    hasExternalEffect ||= tool.behavior.external_effect;
    hasWriteOrHighRisk ||= isHighRisk;
    hasSensitiveData ||= ['confidential', 'restricted'].includes(tool.behavior.data_sensitivity);

    if (names.has(name)) add('HALT', 'duplicate_tool_name', 'tool names must be unique within the MCP server', name);
    names.add(name);

    if (tool.input_schema.type !== 'object') {
      add('HALT', 'invalid_tool_input_schema', 'tool inputSchema must be a JSON Schema object with type object', name);
    }
    if (tool.input_schema.additionalProperties !== false) {
      add('REVIEW', 'open_tool_input_schema', 'tool inputs should reject undocumented fields with additionalProperties false', name);
    }
    if (tool.output_schema === null) {
      add('REVIEW', 'output_schema_missing', 'typed structured results are required for deterministic downstream validation', name);
    }

    visitSchemaProperties(tool.input_schema, (field, definition, fieldPath) => {
      const normalized = normalizeFieldName(field);
      if (prohibitedInputFields.includes(normalized)) {
        add('HALT', 'prohibited_broad_or_secret_input', `prohibited input field ${fieldPath.join('.')} requests broad context or credentials`, name);
      }
      if (definition && Object.prototype.hasOwnProperty.call(definition, 'x-mcp-header') &&
          /(token|secret|password|api_key|credential)/.test(normalized)) {
        add('HALT', 'sensitive_mcp_header', `sensitive field ${fieldPath.join('.')} must not be mirrored into an HTTP header`, name);
      }
    });

    if (isReadOnly && annotations.readOnlyHint !== true) {
      add('HALT', 'read_only_annotation_mismatch', 'read/search tools must declare readOnlyHint true', name);
    }
    if (!isReadOnly && annotations.readOnlyHint !== false) {
      add('HALT', 'write_annotation_mismatch', 'non-read tools must declare readOnlyHint false', name);
    }
    if (isDestructive && annotations.destructiveHint !== true) {
      add('HALT', 'destructive_annotation_mismatch', 'destructive tools must declare destructiveHint true', name);
    }
    if (tool.behavior.external_effect && annotations.openWorldHint !== true) {
      add('HALT', 'open_world_annotation_missing', 'external effects must declare openWorldHint true', name);
    }
    if (!tool.behavior.external_effect && annotations.openWorldHint === true) {
      add('REVIEW', 'open_world_annotation_mismatch', 'openWorldHint does not match the declared external-effect boundary', name);
    }
    if (!tool.behavior.side_effects_declared) {
      add('HALT', 'hidden_side_effects', 'all side effects must be explicit in the tool contract', name);
    }

    const requiredAuthority = operationAuthority[operation];
    if (tool.behavior.required_authority !== requiredAuthority) {
      add('HALT', 'authority_mapping_mismatch', `${operation} requires ${requiredAuthority} authority`, name);
    }
    if (!enforcement.scope_authorized) {
      add('HALT', 'tool_scope_unauthorized', 'a discovered tool cannot authorize its own scope', name);
    }
    if (prohibitedAutomatedOperations.includes(operation)) {
      add('HALT', 'operation_outside_profile', `${operation} is outside automated Agent Plugins 1.0 authority`, name);
    }
    if (tool.behavior.reversibility === 'irreversible' && !enforcement.confirmation_required) {
      add('HALT', 'irreversible_confirmation_missing', 'irreversible behavior requires explicit human confirmation', name);
    }
    if (isHighRisk && enforcement.approval_mode === 'auto') {
      add('HALT', 'unsafe_auto_approval', 'write, execute, destructive, or open-world tools cannot be auto-approved', name);
    }
    if (isHighRisk && enforcement.approval_mode !== 'auto') {
      add('REVIEW', 'consequential_tool_release_review', 'consequential tools require a human release decision even when call-time prompting is configured', name);
    }
    if (isWrite && tool.behavior.idempotency === 'not_applicable') {
      add('REVIEW', 'write_retry_control_missing', 'write tools need idempotency or an explicit repeated-effect control', name);
    }
    if (!enforcement.audit_logged) {
      add('REVIEW', 'tool_audit_log_missing', 'tool calls require a retained audit event', name);
    }
  }

  if (auth.mode === 'none' && (hasWriteOrHighRisk || hasSensitiveData)) {
    add('HALT', 'unauthenticated_sensitive_or_consequential_server', 'unauthenticated servers are limited to public, read-only capabilities');
  }
  if (hasExternalEffect && (server.egress_allowlist.length === 0 || !record.controls.egress_enforced)) {
    add('HALT', 'egress_boundary_missing', 'external effects require an enforced destination allowlist');
  }
  if (!record.controls.least_privilege_reviewed) add('HALT', 'least_privilege_review_missing', 'scope and permission minimization must be reviewed');
  if (!record.controls.user_consent_required) add('HALT', 'user_consent_boundary_missing', 'tool invocation must preserve explicit user consent and control');
  if (!record.controls.tool_inventory_verified) add('HALT', 'tool_inventory_unverified', 'the governed inventory must match the discovered MCP tool list');
  if (record.controls.persists_user_data && !record.controls.deletion_supported) {
    add('HALT', 'data_deletion_control_missing', 'persisted user data requires a deletion path');
  }
  if (!record.controls.structured_results_validated) add('REVIEW', 'structured_result_validation_missing', 'clients should validate structured results against outputSchema');
  if (!record.controls.pii_redacted_logs) add('REVIEW', 'pii_log_redaction_missing', 'audit logs must redact personal data');
  if (record.controls.raw_prompt_logging) add('REVIEW', 'raw_prompt_logging_enabled', 'raw prompt logging requires a documented necessity and privacy review');
  if (!record.controls.retention_documented) add('REVIEW', 'retention_policy_missing', 'data and log retention must be documented');
  if (!record.controls.correlation_ids) add('REVIEW', 'correlation_ids_missing', 'correlation IDs are required for auditable incident reconstruction');

  const sourceRefs = record.evidence.source_refs;
  if (!sourceRefs.some((url) => url.startsWith('https://developers.openai.com/plugins/')) ||
      !sourceRefs.some((url) => url.startsWith('https://modelcontextprotocol.io/'))) {
    add('REVIEW', 'compatibility_evidence_incomplete', 'release evidence must retain both official Agent Plugins and MCP source references');
  }

  const computedGate = findings.reduce(
    (gate, finding) => GATE_RANK[finding.gate] > GATE_RANK[gate] ? finding.gate : gate,
    'ALLOW'
  );
  const declaredMatches = record.declared_gate === computedGate;
  return {
    profile_id: record.profile_id,
    policy_id: policy?.policy_id || null,
    policy_version: policy?.version || null,
    computed_gate: computedGate,
    conformance_verdict: policyErrors.length === 0 && declaredMatches ? 'PASS' : 'FAIL',
    findings,
    checks: {
      policy_valid: policyErrors.length === 0,
      upstream_pins_match: !findings.some((item) => ['agent_plugins_pin_mismatch', 'mcp_version_mismatch'].includes(item.code)),
      manifest_boundary_valid: !findings.some((item) => ['invalid_manifest_path', 'component_path_escape'].includes(item.code)),
      tool_inventory_unique: names.size === record.tools.length,
      declared_gate_matches: declaredMatches
    }
  };
}

if (require.main === module) {
  const [policyPath, recordPath] = process.argv.slice(2);
  if (!policyPath || !recordPath) {
    console.error('Usage: agent-plugin-mcp-compatibility.js <policy.json> <record.json>');
    process.exit(64);
  }
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  const result = evaluate(policy, record);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.conformance_verdict === 'FAIL' ? 3 : result.computed_gate === 'HALT' ? 2 : result.computed_gate === 'REVIEW' ? 1 : 0);
}

module.exports = { evaluate, validatePolicy, EXPECTED };
