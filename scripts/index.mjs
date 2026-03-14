/**
 * @file index.mjs
 * @description Public programmatic API for @diegovelasquezweb/a11y-engine.
 * Consumers can import functions directly instead of reading JSON files from disk.
 */

import { ASSET_PATHS, loadAssetJson } from "./core/asset-loader.mjs";

// ---------------------------------------------------------------------------
// Lazy-loaded asset cache
// ---------------------------------------------------------------------------

let _intelligence = null;
let _pa11yConfig = null;
let _complianceConfig = null;
let _wcagReference = null;

function getIntelligence() {
  if (!_intelligence) _intelligence = loadAssetJson(ASSET_PATHS.remediation.intelligence, "intelligence.json");
  return _intelligence;
}

function getPa11yConfig() {
  if (!_pa11yConfig) {
    try {
      _pa11yConfig = loadAssetJson(ASSET_PATHS.engine.pa11yConfig, "pa11y-config.json");
    } catch {
      _pa11yConfig = { equivalenceMap: {}, ignoreByPrinciple: [], impactMap: {} };
    }
  }
  return _pa11yConfig;
}

function getComplianceConfig() {
  if (!_complianceConfig) _complianceConfig = loadAssetJson(ASSET_PATHS.reporting.complianceConfig, "compliance-config.json");
  return _complianceConfig;
}

function getWcagReference() {
  if (!_wcagReference) _wcagReference = loadAssetJson(ASSET_PATHS.reporting.wcagReference, "wcag-reference.json");
  return _wcagReference;
}

// ---------------------------------------------------------------------------
// Assets access
// ---------------------------------------------------------------------------

/**
 * Returns all engine asset data. Lazy-loaded and cached.
 * @returns {{ intelligence: object, pa11yConfig: object, complianceConfig: object, wcagReference: object }}
 */
export function getAssets() {
  return {
    intelligence: getIntelligence(),
    pa11yConfig: getPa11yConfig(),
    complianceConfig: getComplianceConfig(),
    wcagReference: getWcagReference(),
  };
}

// ---------------------------------------------------------------------------
// Pa11y rule canonicalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a pa11y code token for comparison.
 * @param {string} value
 * @returns {string}
 */
function normalizePa11yToken(value) {
  return value
    .toLowerCase()
    .replace(/^wcag2a{1,3}\./, "")
    .replace(/^pa11y-/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Maps a pa11y rule ID to its canonical axe-equivalent ID.
 * @param {string} ruleId - The current rule ID (may already be canonical or a pa11y slug).
 * @param {string|null} sourceRuleId - The original pa11y code if available.
 * @param {object|null} checkData - The check_data object which may contain a `code` field.
 * @returns {string} The canonical rule ID (e.g., "color-contrast").
 */
export function mapPa11yRuleToCanonical(ruleId, sourceRuleId = null, checkData = null) {
  const equivalenceMap = getPa11yConfig().equivalenceMap || {};

  const checkCode = checkData && typeof checkData === "object" && typeof checkData.code === "string"
    ? checkData.code
    : null;

  const codeCandidates = [sourceRuleId, checkCode, ruleId]
    .filter((v) => typeof v === "string" && v.length > 0)
    .map(normalizePa11yToken);

  const patterns = Object.entries(equivalenceMap).map(([pattern, canonical]) => ({
    pattern: normalizePa11yToken(pattern),
    canonical,
  }));

  for (const code of codeCandidates) {
    for (const entry of patterns) {
      if (code.startsWith(entry.pattern)) {
        return entry.canonical;
      }
    }
  }

  return ruleId;
}

// ---------------------------------------------------------------------------
// Finding enrichment
// ---------------------------------------------------------------------------

/**
 * Enriches findings with intelligence data (fix descriptions, fix code, category).
 * Each finding should have at minimum: { ruleId, sourceRuleId?, checkData?, fixDescription?, fixCode? }
 * @param {object[]} findings - Array of findings with camelCase keys.
 * @returns {object[]} Enriched findings.
 */
export function enrichFindings(findings) {
  const rules = getIntelligence().rules || {};

  return findings.map((finding) => {
    const canonical = mapPa11yRuleToCanonical(
      finding.ruleId || finding.rule_id || "",
      finding.sourceRuleId || finding.source_rule_id || null,
      finding.checkData || finding.check_data || null,
    );

    const normalized = {
      ...finding,
      ruleId: canonical,
      rule_id: canonical,
      sourceRuleId: finding.sourceRuleId || finding.source_rule_id || finding.ruleId || finding.rule_id || null,
    };

    if (normalized.fixDescription || normalized.fix_description ||
        normalized.fixCode || normalized.fix_code) {
      return normalized;
    }

    const info = rules[canonical];
    if (!info) return normalized;

    return {
      ...normalized,
      category: normalized.category ?? info.category ?? null,
      fixDescription: info.fix?.description ?? null,
      fix_description: info.fix?.description ?? null,
      fixCode: info.fix?.code ?? null,
      fix_code: info.fix?.code ?? null,
      falsePositiveRisk: normalized.falsePositiveRisk ?? normalized.false_positive_risk ?? info.false_positive_risk ?? null,
      false_positive_risk: normalized.false_positive_risk ?? info.false_positive_risk ?? null,
      fixDifficultyNotes: normalized.fixDifficultyNotes ?? normalized.fix_difficulty_notes ?? info.fix_difficulty_notes ?? null,
      fix_difficulty_notes: normalized.fix_difficulty_notes ?? info.fix_difficulty_notes ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Computes compliance score, grade label, and WCAG pass/fail status.
 * @param {{ Critical: number, Serious: number, Moderate: number, Minor: number }} totals
 * @returns {{ score: number, label: string, wcagStatus: "Pass" | "Conditional Pass" | "Fail" }}
 */
export function computeScore(totals) {
  const config = getComplianceConfig();
  const penalties = config.complianceScore.penalties;
  const thresholds = config.gradeThresholds;

  const rawScore =
    config.complianceScore.baseScore -
    totals.Critical * (penalties.Critical ?? 15) -
    totals.Serious * (penalties.Serious ?? 5) -
    totals.Moderate * (penalties.Moderate ?? 2) -
    totals.Minor * (penalties.Minor ?? 0.5);

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let label = "Critical";
  for (const threshold of thresholds) {
    if (score >= threshold.min) {
      label = threshold.label;
      break;
    }
  }

  let wcagStatus = "Pass";
  if (totals.Critical > 0 || totals.Serious > 0) wcagStatus = "Fail";
  else if (totals.Moderate > 0 || totals.Minor > 0) wcagStatus = "Conditional Pass";

  return { score, label, wcagStatus };
}

// ---------------------------------------------------------------------------
// Persona grouping
// ---------------------------------------------------------------------------

/**
 * Groups findings by accessibility persona (screen reader, keyboard, cognitive, etc.).
 * @param {object[]} findings - Array of findings with ruleId, wcagCriterionId, impactedUsers.
 * @returns {Record<string, { label: string, count: number, icon: string }>}
 */
export function computePersonaGroups(findings) {
  const ref = getWcagReference();
  const personaConfig = ref.personaConfig || {};
  const personaMapping = ref.personaMapping || {};
  const wcagCriterionMap = ref.wcagCriterionMap || {};

  const groups = {};
  for (const [key, config] of Object.entries(personaConfig)) {
    groups[key] = { label: config.label, count: 0, icon: key };
  }

  const criterionToPersonas = {};
  for (const [personaKey, mapping] of Object.entries(personaMapping)) {
    for (const rule of mapping.rules) {
      const criterion = wcagCriterionMap[rule];
      if (criterion) {
        if (!criterionToPersonas[criterion]) criterionToPersonas[criterion] = new Set();
        criterionToPersonas[criterion].add(personaKey);
      }
    }
  }

  for (const f of findings) {
    const ruleId = (f.ruleId || f.rule_id || "").toLowerCase();
    const wcagCriterionId = f.wcagCriterionId || f.wcag_criterion_id || "";
    const users = (f.impactedUsers || f.impacted_users || "").toLowerCase();
    const matchedPersonas = new Set();

    for (const [personaKey, mapping] of Object.entries(personaMapping)) {
      if (!groups[personaKey]) continue;
      const matchesRule = mapping.rules.some((r) => ruleId === r.toLowerCase());
      if (matchesRule) {
        matchedPersonas.add(personaKey);
        groups[personaKey].count++;
        continue;
      }
      if (wcagCriterionId && criterionToPersonas[wcagCriterionId]?.has(personaKey)) {
        matchedPersonas.add(personaKey);
        groups[personaKey].count++;
        continue;
      }
    }

    if (matchedPersonas.size === 0 && users) {
      for (const [personaKey, mapping] of Object.entries(personaMapping)) {
        if (!groups[personaKey] || matchedPersonas.has(personaKey)) continue;
        const matchesKeyword = mapping.keywords.some((kw) => users.includes(kw.toLowerCase()));
        if (matchesKeyword) groups[personaKey].count++;
      }
    }
  }

  return groups;
}
