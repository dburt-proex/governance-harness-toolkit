#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_LIFECYCLES = new Set(["rejected", "retired", "unavailable"]);
const NON_FINAL_ROLES = new Set(["corroborating", "contextual", "discovery_only"]);

function parseDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be an ISO 8601 date (YYYY-MM-DD)`);
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} is not a valid calendar date`);
  }
  return date;
}

function datePart(value, field) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be an ISO 8601 date-time`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be an ISO 8601 date-time`);
  }
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = parseDate(value, "freshness.last_checked");
  return formatDate(new Date(date.getTime() + days * DAY_MS));
}

function violation(code, message, actual, expected) {
  return { code, message, actual, expected };
}

function evaluateSourcePolicy(record, evaluationDate) {
  const violations = [];
  const asOf = parseDate(evaluationDate, "evaluation_date");

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("record must be an object that has already passed schema validation");
  }
  if (!record.freshness || !record.provenance) {
    throw new Error("record.freshness and record.provenance are required");
  }

  const freshness = record.freshness;
  const lastChecked = parseDate(freshness.last_checked, "freshness.last_checked");
  const expectedNextReview = addDays(freshness.last_checked, freshness.window_days);
  const expectedNextReviewDate = parseDate(expectedNextReview, "expected_next_review");

  if (freshness.next_review !== expectedNextReview) {
    violations.push(violation(
      "NEXT_REVIEW_WINDOW_MISMATCH",
      "next_review must equal last_checked plus window_days",
      freshness.next_review,
      expectedNextReview
    ));
  }

  let temporalFreshnessStatus;
  if (asOf.getTime() < expectedNextReviewDate.getTime()) {
    temporalFreshnessStatus = "current";
  } else if (asOf.getTime() === expectedNextReviewDate.getTime()) {
    temporalFreshnessStatus = "due";
  } else {
    temporalFreshnessStatus = "expired";
  }

  let computedFreshnessStatus;
  if (freshness.material_change) {
    computedFreshnessStatus = "review_required";
  } else if (["unknown", "review_required"].includes(freshness.status)) {
    computedFreshnessStatus = freshness.status;
  } else {
    computedFreshnessStatus = temporalFreshnessStatus;
  }

  if (freshness.status !== computedFreshnessStatus) {
    violations.push(violation(
      "FRESHNESS_STATUS_MISMATCH",
      "declared freshness status does not match the evaluation date and review policy",
      freshness.status,
      computedFreshnessStatus
    ));
  }

  if (freshness.material_change && !String(freshness.change_summary || "").trim()) {
    violations.push(violation(
      "MATERIAL_CHANGE_SUMMARY_REQUIRED",
      "a material change requires a non-empty change_summary",
      freshness.change_summary || null,
      "non-empty string"
    ));
  }

  const retrievedDate = parseDate(
    datePart(record.provenance.retrieved_at, "provenance.retrieved_at"),
    "provenance.retrieved_at"
  );
  const registeredDate = parseDate(
    datePart(record.provenance.registered_at, "provenance.registered_at"),
    "provenance.registered_at"
  );

  if (registeredDate.getTime() > asOf.getTime()) {
    violations.push(violation(
      "FUTURE_REGISTRATION",
      "registered_at cannot be later than the evaluation date",
      record.provenance.registered_at,
      `on or before ${evaluationDate}`
    ));
  }

  if (retrievedDate.getTime() > asOf.getTime()) {
    violations.push(violation(
      "FUTURE_RETRIEVAL",
      "retrieved_at cannot be later than the evaluation date",
      record.provenance.retrieved_at,
      `on or before ${evaluationDate}`
    ));
  }

  if (lastChecked.getTime() < retrievedDate.getTime()) {
    violations.push(violation(
      "LAST_CHECK_PRECEDES_RETRIEVAL",
      "last_checked cannot precede the retrieved content date",
      freshness.last_checked,
      `on or after ${formatDate(retrievedDate)}`
    ));
  }

  if (lastChecked.getTime() > asOf.getTime()) {
    violations.push(violation(
      "FUTURE_FRESHNESS_CHECK",
      "last_checked cannot be later than the evaluation date",
      freshness.last_checked,
      `on or before ${evaluationDate}`
    ));
  }

  const isFinal = record.decision_eligibility === "final";
  const mustBeBlocked = ["expired", "unknown", "review_required"].includes(computedFreshnessStatus)
    || TERMINAL_LIFECYCLES.has(record.lifecycle_status);

  if (mustBeBlocked && record.decision_eligibility !== "blocked") {
    violations.push(violation(
      "INELIGIBLE_SOURCE_NOT_BLOCKED",
      "expired, unknown, materially changed, rejected, retired, or unavailable sources must be blocked",
      record.decision_eligibility,
      "blocked"
    ));
  }

  if (isFinal && record.lifecycle_status !== "approved") {
    violations.push(violation(
      "FINAL_SOURCE_NOT_APPROVED",
      "final decision eligibility requires an approved lifecycle",
      record.lifecycle_status,
      "approved"
    ));
  }

  if (isFinal && computedFreshnessStatus !== "current") {
    violations.push(violation(
      "FINAL_SOURCE_NOT_CURRENT",
      "final decision eligibility requires current freshness",
      computedFreshnessStatus,
      "current"
    ));
  }

  if (isFinal && (record.authority_tier !== 1 || NON_FINAL_ROLES.has(record.authority_role))) {
    violations.push(violation(
      "FINAL_SOURCE_AUTHORITY_INSUFFICIENT",
      "final decision eligibility requires tier 1 authoritative evidence",
      { authority_tier: record.authority_tier, authority_role: record.authority_role },
      { authority_tier: 1, authority_role: "authoritative" }
    ));
  }

  const result = violations.length === 0 ? "PASS" : "FAIL";
  let gate = "HALT";

  if (result === "PASS") {
    if (record.decision_eligibility === "final") {
      gate = "ALLOW";
    } else if (
      record.decision_eligibility === "corroboration_required"
      || record.decision_eligibility === "context_only"
      || computedFreshnessStatus === "due"
      || record.lifecycle_status === "proposed"
    ) {
      gate = "REVIEW";
    }
  }

  return {
    source_id: record.source_id,
    evaluation_date: evaluationDate,
    result,
    gate,
    final_eligible: result === "PASS" && gate === "ALLOW",
    computed_freshness_status: computedFreshnessStatus,
    expected_next_review: expectedNextReview,
    violations
  };
}

function runRegressionCases(document) {
  let failed = 0;
  const results = document.cases.map((testCase) => {
    let actual;
    try {
      actual = evaluateSourcePolicy(testCase.record, testCase.evaluation_date);
    } catch (error) {
      actual = { result: "ERROR", gate: "HALT", final_eligible: false, error: error.message };
    }

    const matched = actual.result === testCase.expect_result
      && actual.gate === testCase.expect_gate
      && actual.final_eligible === testCase.expect_final_eligible;
    if (!matched) failed += 1;

    return {
      case_id: testCase.case_id,
      matched,
      expected: {
        result: testCase.expect_result,
        gate: testCase.expect_gate,
        final_eligible: testCase.expect_final_eligible
      },
      actual
    };
  });

  return { passed: results.length - failed, failed, results };
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node evaluators/source-policy-coherence.js <fixture-or-record.json> [evaluation-date]");
    process.exit(2);
  }

  const document = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (Array.isArray(document.cases)) {
    const summary = runRegressionCases(document);
    for (const result of summary.results) {
      console.log(`${result.case_id}: ${result.matched ? "PASS" : "FAIL"} (${result.actual.result}/${result.actual.gate})`);
    }
    console.log(`Result: ${summary.passed}/${summary.results.length} regression cases passed`);
    process.exit(summary.failed === 0 ? 0 : 1);
  }

  const evaluationDate = process.argv[3] || document.evaluation_date;
  const record = document.record || document;
  const result = evaluateSourcePolicy(record, evaluationDate);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === "PASS" ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateSourcePolicy, runRegressionCases };
