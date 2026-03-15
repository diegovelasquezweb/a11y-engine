/**
 * @file findings.mjs
 * @description Core data normalization and scoring logic for accessibility findings.
 * Provides functions to process raw scanner results into a structured format used
 * across all report types (HTML, Markdown, PDF).
 */

import { ASSET_PATHS, loadAssetJson } from "../../core/asset-loader.mjs";

const SCORING_CONFIG = loadAssetJson(
  ASSET_PATHS.reporting.complianceConfig,
  "assets/reporting/compliance-config.json",
);
const RULE_METADATA = loadAssetJson(
  ASSET_PATHS.reporting.wcagReference,
  "assets/reporting/wcag-reference.json",
);

/**
 * Defines the priority order for severity levels, where lower values indicate higher priority.
 * @type {Object<string, number>}
 */
export const SEVERITY_ORDER = SCORING_CONFIG.severityOrder;


/**
 * Normalizes raw scanner finding objects into a consistent structure for reporting.
 * Sorts the result by severity and then by ID.
 * @param {Object} payload - The raw scanner result payload.
 * @param {Object[]} payload.findings - The array of findings to normalize.
 * @returns {Object[]} An array of normalized and sorted finding objects.
 * @throws {Error} If the payload structure is invalid.
 */
export function normalizeFindings(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.findings)
  ) {
    throw new Error("Input must be a JSON object with a 'findings' array.");
  }

  return payload.findings
    .map((item, index) => ({
      id: String(item.id ?? `A11Y-${String(index + 1).padStart(3, "0")}`),
      ruleId: String(item.rule_id ?? ""),
      category: item.category ?? null,
      title: String(item.title ?? "Untitled finding"),
      severity: String(item.severity ?? "Unknown"),
      wcag: String(item.wcag ?? ""),
      wcagClassification: item.wcag_classification ?? null,
      area: String(item.area ?? ""),
      url: String(item.url ?? ""),
      selector: String(item.selector ?? ""),
      primarySelector: String(item.primary_selector ?? item.selector ?? ""),
      impactedUsers: String(
        item.impacted_users ?? "Users relying on assistive technology",
      ),
      actual: String(item.actual ?? ""),
      primaryFailureMode: item.primary_failure_mode ?? null,
      relationshipHint: item.relationship_hint ?? null,
      failureChecks: Array.isArray(item.failure_checks) ? item.failure_checks : [],
      relatedContext: Array.isArray(item.related_context) ? item.related_context : [],
      expected: String(item.expected ?? ""),
      mdn: item.mdn ?? null,
      fixDescription: item.fix_description ?? null,
      fixCode: item.fix_code ?? null,
      recommendedFix: String(item.recommended_fix ?? item.recommendedFix ?? ""),
      evidence: Array.isArray(item.evidence) ? item.evidence : [],
      totalInstances:
        typeof item.total_instances === "number" ? item.total_instances : null,
      effort: item.effort ?? null,
      relatedRules: Array.isArray(item.related_rules) ? item.related_rules : [],
      fixCodeLang: item.fix_code_lang ?? "html",
      screenshotPath: item.screenshot_path ?? null,
      falsePositiveRisk: item.false_positive_risk ?? null,
      guardrails: item.guardrails ?? null,
      fixDifficultyNotes: item.fix_difficulty_notes ?? null,
      frameworkNotes: item.framework_notes ?? null,
      cmsNotes: item.cms_notes ?? null,
      fileSearchPattern: item.file_search_pattern ?? null,
      ownershipStatus: item.ownership_status ?? "unknown",
      ownershipReason: item.ownership_reason ?? null,
      primarySourceScope: Array.isArray(item.primary_source_scope)
        ? item.primary_source_scope
        : [],
      searchStrategy: item.search_strategy ?? "verify_ownership_before_search",
      managedByLibrary: item.managed_by_library ?? null,
      componentHint: item.component_hint ?? null,
      verificationCommand: item.verification_command ?? null,
      verificationCommandFallback: item.verification_command_fallback ?? null,
      pagesAffected: typeof item.pages_affected === "number" ? item.pages_affected : null,
      affectedUrls: Array.isArray(item.affected_urls) ? item.affected_urls : null,
      checkData: item.check_data ?? null,
    }))
    .sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 99;
      const sb = SEVERITY_ORDER[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Aggregates findings by their severity level.
 * @param {Object[]} findings - The normalized list of findings.
 * @returns {Object<string, number>} An object mapping severity labels to counts.
 */
export function buildSummary(findings) {
  const totals = { Critical: 0, Serious: 0, Moderate: 0, Minor: 0 };
  for (const finding of findings) {
    if (finding.severity in totals) totals[finding.severity] += 1;
  }
  return totals;
}

/**
 * Calculates a global compliance score (0-100) based on weighted severity counts.
 * @param {Object<string, number>} totals - The summary of counts per severity.
 * @returns {number} An integer compliance score from 0 to 100.
 */
export function computeComplianceScore(totals) {
  const { baseScore, penalties } = SCORING_CONFIG.complianceScore;
  const raw =
    baseScore -
    totals.Critical * penalties.Critical -
    totals.Serious * penalties.Serious -
    totals.Moderate * penalties.Moderate -
    totals.Minor * penalties.Minor;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Returns a human-readable performance label (grade) based on the compliance score.
 * @param {number} score - The calculated compliance score.
 * @returns {string} A label like "Excellent", "Good", "Fair", "Poor", or "Critical".
 */
export function scoreLabel(score) {
  for (const { min, label } of SCORING_CONFIG.gradeThresholds) {
    if (score >= min) return label;
  }
  return "Critical";
}

export function wcagOverallStatus(totals) {
  if (totals.Critical > 0 || totals.Serious > 0) return "Fail";
  if (totals.Moderate > 0 || totals.Minor > 0) return "Conditional Pass";
  return "Pass";
}

/**
 * Analyzes findings to determine the unique number of issues impacting specific user personas.
 * @param {Object[]} findings - The normalized list of findings.
 * @returns {Object} An object containing impact counts for screenReader, keyboard, vision, and cognitive personas.
 */
export function buildPersonaSummary(findings) {
  const SMART_MAP = RULE_METADATA.personaMapping;

  const uniqueIssues = {};
  for (const persona of Object.keys(SMART_MAP)) {
    uniqueIssues[persona] = new Set();
  }

  for (const f of findings) {
    const users = (f.impactedUsers || "").toLowerCase();
    const ruleId = (f.ruleId || "").toLowerCase();
    const title = (f.title || "").toLowerCase();
    const issueKey = f.ruleId || f.title;

    Object.keys(SMART_MAP).forEach((persona) => {
      const { rules, keywords } = SMART_MAP[persona];
      const matchRule = rules.some((r) => ruleId.includes(r.toLowerCase()));
      const matchKeyword = keywords.some(
        (k) => users.includes(k) || title.includes(k),
      );

      if (matchRule || matchKeyword) {
        uniqueIssues[persona].add(issueKey);
      }
    });
  }

  const result = {};
  for (const persona of Object.keys(SMART_MAP)) {
    result[persona] = uniqueIssues[persona].size;
  }
  return result;
}
