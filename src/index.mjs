/**
 * @file index.mjs
 * @description Public programmatic API for @diegovelasquezweb/a11y-engine.
 * Consumers can import functions directly instead of reading JSON files from disk.
 */

import { ASSET_PATHS, loadAssetJson } from "./core/asset-loader.mjs";
export { DEFAULT_AI_SYSTEM_PROMPT, PM_AI_SYSTEM_PROMPT } from "./ai/claude.mjs";

// Lazy-loaded asset cache

let _intelligence = null;
let _pa11yConfig = null;
let _complianceConfig = null;
let _wcagReference = null;
let _knowledge = null;

function getIntelligence() {
  if (!_intelligence) _intelligence = loadAssetJson(ASSET_PATHS.remediation.intelligence, "intelligence.json");
  return _intelligence;
}

function getPa11yConfig() {
  if (!_pa11yConfig) {
    try {
      _pa11yConfig = loadAssetJson(ASSET_PATHS.scanning.pa11yConfig, "pa11y-config.json");
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

function getKnowledgeData() {
  if (!_knowledge) _knowledge = loadAssetJson(ASSET_PATHS.knowledge.knowledge, "knowledge.json");
  return _knowledge;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveKnowledgeLocale(locale = "en") {
  const payload = getKnowledgeData();
  const locales = payload.locales || {};
  if (locale && locales[locale]) return locale;
  return "en";
}

// Pa11y rule canonicalization (internal)

function normalizePa11yToken(value) {
  return value
    .toLowerCase()
    .replace(/^wcag2a{1,3}\./, "")
    .replace(/^pa11y-/, "")
    .replace(/[^a-z0-9]/g, "");
}

function mapPa11yRuleToCanonical(ruleId, sourceRuleId = null, checkData = null) {
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

// Raw finding normalization (internal)

const SEVERITY_ORDER = { Critical: 1, Serious: 2, Moderate: 3, Minor: 4 };

function str(v, fallback = "") {
  return typeof v === "string" ? v : (v != null ? String(v) : fallback);
}

function strOrNull(v) {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function normalizeSingleFinding(item, index, screenshotUrlBuilder) {
  const screenshotRaw = strOrNull(item.screenshot_path);
  const screenshotPath = screenshotRaw && screenshotUrlBuilder
    ? screenshotUrlBuilder(screenshotRaw)
    : screenshotRaw;

  return {
    id: str(item.id, `A11Y-${String(index + 1).padStart(3, "0")}`),
    rule_id: str(item.rule_id),
    source: str(item.source, "axe"),
    source_rule_id: strOrNull(item.source_rule_id),
    wcag_criterion_id: strOrNull(item.wcag_criterion_id),
    category: strOrNull(item.category),
    title: str(item.title, "Untitled finding"),
    severity: str(item.severity, "Unknown"),
    wcag: str(item.wcag),
    wcag_classification: strOrNull(item.wcag_classification),
    area: str(item.area),
    url: str(item.url),
    selector: str(item.selector),
    primary_selector: str(item.primary_selector || item.selector),
    impacted_users: str(item.impacted_users),
    actual: str(item.actual),
    primary_failure_mode: strOrNull(item.primary_failure_mode),
    relationship_hint: strOrNull(item.relationship_hint),
    failure_checks: Array.isArray(item.failure_checks) ? item.failure_checks : [],
    related_context: Array.isArray(item.related_context) ? item.related_context : [],
    expected: str(item.expected),
    mdn: strOrNull(item.mdn),
    fix_description: strOrNull(item.fix_description),
    fix_code: strOrNull(item.fix_code),
    fix_code_lang: str(item.fix_code_lang, "html"),
    recommended_fix: str(item.recommended_fix),
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    total_instances: typeof item.total_instances === "number" ? item.total_instances : null,
    effort: strOrNull(item.effort),  // null = will be inferred during enrichment
    related_rules: Array.isArray(item.related_rules) ? item.related_rules : [],
    screenshot_path: screenshotPath,
    false_positive_risk: strOrNull(item.false_positive_risk),
    guardrails: item.guardrails && typeof item.guardrails === "object" ? item.guardrails : null,
    fix_difficulty_notes: item.fix_difficulty_notes ?? null,
    framework_notes: strOrNull(item.framework_notes),
    cms_notes: strOrNull(item.cms_notes),
    file_search_pattern: strOrNull(item.file_search_pattern),
    ownership_status: str(item.ownership_status, "unknown"),
    ownership_reason: strOrNull(item.ownership_reason),
    primary_source_scope: Array.isArray(item.primary_source_scope) ? item.primary_source_scope : [],
    search_strategy: str(item.search_strategy, "verify_ownership_before_search"),
    managed_by_library: strOrNull(item.managed_by_library),
    component_hint: strOrNull(item.component_hint),
    verification_command: strOrNull(item.verification_command),
    verification_command_fallback: strOrNull(item.verification_command_fallback),
    check_data: item.check_data && typeof item.check_data === "object" ? item.check_data : null,
    pages_affected: typeof item.pages_affected === "number" ? item.pages_affected : null,
    affected_urls: Array.isArray(item.affected_urls) ? item.affected_urls : null,
    needs_verification: Boolean(item.needs_verification),
    pm_summary: strOrNull(item.pm_summary),
    pm_impact: strOrNull(item.pm_impact),
    pm_effort: strOrNull(item.pm_effort),
  };
}

// Finding enrichment

/**
 * Normalizes and enriches raw findings with intelligence data.
 *
 * Options:
 * - screenshotUrlBuilder: (rawPath: string) => string — transforms screenshot
 *   paths into consumer-specific URLs.
 *
 * @param {{findings: object[]}} input
 * @param {{ screenshotUrlBuilder?: (path: string) => string }} [options={}]
 * @returns {object[]} Enriched, normalized, sorted findings.
 */
export function getFindings(input, options = {}) {
  const { screenshotUrlBuilder = null } = options;
  const rules = getIntelligence().rules || {};

  if (input?.ai_enriched_findings?.length > 0 && !screenshotUrlBuilder) {
    return input.ai_enriched_findings;
  }

  const rawFindings = input?.findings || [];

  const normalized = rawFindings.map((item, index) =>
    normalizeSingleFinding(item, index, screenshotUrlBuilder)
  );

  const enriched = normalized.map((finding) => {
    const canonical = mapPa11yRuleToCanonical(
      finding.rule_id,
      finding.source_rule_id,
      finding.check_data,
    );

    const enrichedFinding = {
      id: finding.id,
      ruleId: canonical,
      source: finding.source,
      sourceRuleId: finding.source_rule_id || finding.rule_id || null,
      title: finding.title,
      severity: finding.severity,
      wcag: finding.wcag,
      wcagCriterionId: finding.wcag_criterion_id,
      wcagClassification: finding.wcag_classification,
      category: finding.category,
      area: finding.area,
      url: finding.url,
      selector: finding.selector,
      primarySelector: finding.primary_selector,
      impactedUsers: finding.impacted_users,
      actual: finding.actual,
      expected: finding.expected,
      primaryFailureMode: finding.primary_failure_mode,
      relationshipHint: finding.relationship_hint,
      failureChecks: finding.failure_checks,
      relatedContext: finding.related_context,
      mdn: finding.mdn,
      fixDescription: finding.fix_description,
      fixCode: finding.fix_code,
      fixCodeLang: finding.fix_code_lang,
      recommendedFix: finding.recommended_fix,
      evidence: finding.evidence,
      totalInstances: finding.total_instances,
      effort: finding.effort ?? (finding.fix_code ? "low" : "high"),
      relatedRules: finding.related_rules,
      screenshotPath: finding.screenshot_path,
      falsePositiveRisk: finding.false_positive_risk,
      guardrails: finding.guardrails,
      fixDifficultyNotes: finding.fix_difficulty_notes,
      frameworkNotes: finding.framework_notes,
      cmsNotes: finding.cms_notes,
      fileSearchPattern: finding.file_search_pattern,
      ownershipStatus: finding.ownership_status,
      ownershipReason: finding.ownership_reason,
      primarySourceScope: finding.primary_source_scope,
      searchStrategy: finding.search_strategy,
      managedByLibrary: finding.managed_by_library,
      componentHint: finding.component_hint,
      verificationCommand: finding.verification_command,
      verificationCommandFallback: finding.verification_command_fallback,
      checkData: finding.check_data,
      pagesAffected: finding.pages_affected,
      affectedUrls: finding.affected_urls,
      needsVerification: finding.needs_verification,
      pmSummary: finding.pm_summary ?? null,
      pmImpact: finding.pm_impact ?? null,
      pmEffort: finding.pm_effort ?? null,
    };

    // Enrich from intelligence if no fix data exists yet
    if (!enrichedFinding.fixDescription && !enrichedFinding.fixCode) {
      const info = rules[canonical];
      if (info) {
        enrichedFinding.category = enrichedFinding.category ?? info.category ?? null;
        enrichedFinding.fixDescription = info.fix?.description ?? null;
        enrichedFinding.fixCode = info.fix?.code ?? null;
        enrichedFinding.falsePositiveRisk = enrichedFinding.falsePositiveRisk ?? info.false_positive_risk ?? null;
        enrichedFinding.fixDifficultyNotes = enrichedFinding.fixDifficultyNotes ?? info.fix_difficulty_notes ?? null;
      }
    }

    // Infer effort AFTER enrichment so intelligence-provided fixCode is considered
    if (!enrichedFinding.effort || enrichedFinding.effort === "null") {
      enrichedFinding.effort = enrichedFinding.fixCode ? "low" : "high";
    }

    return enrichedFinding;
  });

  enriched.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });

  return enriched;
}

// Score computation (internal)

function getComplianceScore(totals) {
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

// Persona grouping (internal)

function getPersonaGroups(findings) {
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
    const ruleId = (f.ruleId || "").toLowerCase();
    const wcagCriterionId = f.wcagCriterionId || "";
    const users = (f.impactedUsers || "").toLowerCase();
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

// Audit summary

/**
 * Computes a complete audit summary from enriched findings: severity totals,
 * compliance score, grade label, WCAG status, persona groups, quick wins,
 * target URL, and detected stack.
 *
 * @param {object[]} findings - Array of enriched findings.
 * @param {{ findings: object[], metadata?: object }|null} [payload=null] - Original scan payload for metadata extraction.
 * @param {{ countIncompleteInScore?: boolean }} [options={}] - Scoring options.
 * @returns {object} Full audit summary.
 */
export function getOverview(findings, payload = null, options = {}) {
  const scorableFindings = options.countIncompleteInScore
    ? findings
    : findings.filter((f) => !f.needsVerification);
  const totals = { Critical: 0, Serious: 0, Moderate: 0, Minor: 0 };
  for (const f of scorableFindings) {
    const severity = f.severity || "";
    if (severity in totals) totals[severity] += 1;
  }

  const { score, label, wcagStatus } = getComplianceScore(totals);
  const personaGroups = getPersonaGroups(findings);

  const quickWins = findings
    .filter((f) =>
      (f.severity === "Critical" || f.severity === "Serious") &&
      f.fixCode
    )
    .slice(0, 3);

  // Extract metadata from payload if provided
  let targetUrl = "";
  let detectedStack = { framework: null, cms: null, uiLibraries: [] };

  if (payload && payload.metadata) {
    const meta = payload.metadata;
    const firstUrl = findings.length > 0 ? str(findings[0].url) : "";
    targetUrl = str(meta.target_url || meta.targetUrl || meta.base_url || firstUrl);

    const ctx = meta.projectContext || {};
    detectedStack = {
      framework: strOrNull(ctx.framework),
      cms: strOrNull(ctx.cms),
      uiLibraries: Array.isArray(ctx.uiLibraries) ? ctx.uiLibraries : [],
    };
  }

  return {
    totals,
    score,
    label,
    wcagStatus,
    personaGroups,
    quickWins,
    targetUrl,
    detectedStack,
    totalFindings: findings.length,
  };
}

// Knowledge APIs

/**
 * Returns scanner-facing help metadata including engine descriptions,
 * advanced option hints, and defaults.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, title: string, engines: object[], options: object[] }}
 */
function getScannerHelp(options = {}) {
  const locale = resolveKnowledgeLocale(options.locale || "en");
  const payload = getKnowledgeData();
  const scanner = payload.locales[locale]?.scanner || { title: "Scanner Help", engines: [], options: [] };

  return {
    locale,
    version: payload.version || "1.0.0",
    title: scanner.title,
    engines: clone(scanner.engines || []),
    options: clone(scanner.options || []),
  };
}

/**
 * Returns persona explanations with labels, descriptions, and the WCAG rule/
 * keyword mappings used for impact grouping.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, personas: object[] }}
 */
function getPersonaReference(options = {}) {
  const locale = resolveKnowledgeLocale(options.locale || "en");
  const payload = getKnowledgeData();
  const wcagRef = getWcagReference();

  const copyMap = payload.locales[locale]?.personas || {};
  const personaConfig = wcagRef.personaConfig || {};
  const personaMapping = wcagRef.personaMapping || {};

  const personas = Object.keys(copyMap).map((id) => {
    const copy = copyMap[id] || {};
    const config = personaConfig[id] || {};
    const mapping = personaMapping[id] || {};

    return {
      id,
      icon: id,
      label: copy.label || config.label || id,
      description: copy.description || "",
      keywords: Array.isArray(mapping.keywords) ? clone(mapping.keywords) : [],
      mappedRules: Array.isArray(mapping.rules) ? clone(mapping.rules) : [],
    };
  });

  return {
    locale,
    version: payload.version || "1.0.0",
    personas,
  };
}

/**
 * Returns UI tooltip copy and glossary terms for scanner cards and labels.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, tooltips: Record<string, object>, glossary: object[] }}
 */
function getConceptsAndGlossary(options = {}) {
  const locale = resolveKnowledgeLocale(options.locale || "en");
  const payload = getKnowledgeData();
  const localePayload = payload.locales[locale] || {};

  return {
    locale,
    version: payload.version || "1.0.0",
    concepts: clone(localePayload.concepts || {}),
    glossary: clone(localePayload.glossary || []),
  };
}

/**
 * Returns the full documentation package that frontends or agents can render
 * as help content next to findings and scores.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, scanner: object, personas: object[], tooltips: Record<string, object>, glossary: object[] }}
 */
/**
 * Returns conformance level definitions with WCAG axe-core tag mappings.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, conformanceLevels: object[] }}
 */
function getConformanceLevels(options = {}) {
  const locale = resolveKnowledgeLocale(options.locale || "en");
  const payload = getKnowledgeData();
  const levels = payload.locales[locale]?.conformanceLevels || [];
  return {
    locale,
    version: payload.version || "1.0.0",
    conformanceLevels: clone(levels),
  };
}

/**
 * Returns the four WCAG principles with their criterion prefix patterns.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, wcagPrinciples: object[] }}
 */
function getWcagPrinciples(options = {}) {
  const locale = resolveKnowledgeLocale(options.locale || "en");
  const payload = getKnowledgeData();
  const principles = payload.locales[locale]?.wcagPrinciples || [];
  return {
    locale,
    version: payload.version || "1.0.0",
    wcagPrinciples: clone(principles),
  };
}

/**
 * Returns severity level definitions with labels, descriptions, and ordering.
 *
 * @param {{ locale?: string }} [options={}]
 * @returns {{ locale: string, version: string, severityLevels: object[] }}
 */
function getSeverityLevels(options = {}) {
  const locale = resolveKnowledgeLocale(options.locale || "en");
  const payload = getKnowledgeData();
  const levels = payload.locales[locale]?.severityLevels || [];
  return {
    locale,
    version: payload.version || "1.0.0",
    severityLevels: clone(levels),
  };
}

export const VIEWPORT_PRESETS = [
  { label: "Desktop", width: 1280, height: 800 },
  { label: "Laptop",  width: 1440, height: 900 },
  { label: "Tablet",  width: 768,  height: 1024 },
  { label: "Mobile",  width: 375,  height: 812 },
];

export function getKnowledge(options = {}) {
  const scanner = getScannerHelp(options);
  const personas = getPersonaReference(options);
  const ui = getConceptsAndGlossary(options);
  const conformance = getConformanceLevels(options);
  const principles = getWcagPrinciples(options);
  const severity = getSeverityLevels(options);
  const payload = getKnowledgeData();
  const docs = clone(payload.locales[scanner.locale]?.docs ?? { sections: [] });

  return {
    locale: scanner.locale,
    version: scanner.version,
    scanner: {
      title: scanner.title,
      engines: scanner.engines,
      options: scanner.options,
    },
    personas: personas.personas,
    concepts: ui.concepts,
    glossary: ui.glossary,
    docs,
    conformanceLevels: conformance.conformanceLevels,
    wcagPrinciples: principles.wcagPrinciples,
    severityLevels: severity.severityLevels,
  };
}

// Full audit pipeline

/**
 * Runs a complete accessibility audit: crawl + scan (axe + CDP + pa11y) + analyze.
 * Returns the scan payload ready for getFindings().
 *
 * @param {{
 *   baseUrl: string,
 *   maxRoutes?: number,
 *   crawlDepth?: number,
 *   routes?: string,
 *   waitMs?: number,
 *   timeoutMs?: number,
 *   headless?: boolean,
 *   waitUntil?: string,
 *   colorScheme?: string,
 *   viewport?: { width: number, height: number },
 *   axeTags?: string[],
 *   onlyRule?: string,
 *   excludeSelectors?: string[],
 *   ignoreFindings?: string[],
 *   framework?: string,
 *   projectDir?: string,
 *   skipPatterns?: boolean,
 *   includeIncomplete?: boolean,
 *   engines?: { axe?: boolean, cdp?: boolean, pa11y?: boolean },
 *   onProgress?: (step: string, status: string, extra?: object) => void,
 * }} options
 * @returns {Promise<{ findings: object[], metadata: object, incomplete_findings?: object[] }>}
 */
export async function runAudit(options) {
  if (!options.baseUrl) throw new Error("runAudit requires baseUrl");

  const { runDomScanner } = await import("./pipeline/dom-scanner.mjs");
  const { runAnalyzer } = await import("./enrichment/analyzer.mjs");

  const onProgress = options.onProgress || null;

  // Normalize engines — default all enabled
  const engines = {
    axe: options.engines?.axe !== false,
    cdp: options.engines?.cdp !== false,
    pa11y: options.engines?.pa11y !== false,
  };

  // Fetch remote package.json via GitHub API if repoUrl is provided
  let remotePackageJson = null;
  if (options.repoUrl && !options.projectDir) {
    if (onProgress) onProgress("repo", "running");
    try {
      const { fetchPackageJson } = await import("./core/github-api.mjs");
      remotePackageJson = await fetchPackageJson(options.repoUrl, options.githubToken);
      if (remotePackageJson) {
        if (onProgress) onProgress("repo", "done", { packageJson: true });
      } else {
        if (onProgress) onProgress("repo", "skipped", { reason: "Could not read package.json" });
      }
    } catch (err) {
      if (onProgress) onProgress("repo", "skipped", { reason: err.message });
    }
  }

  // Step 1: DOM scan (selected engines)
  if (onProgress) onProgress("page", "running");

  const scanPayload = await runDomScanner(
    {
      baseUrl: options.baseUrl,
      maxRoutes: options.maxRoutes,
      crawlDepth: options.crawlDepth,
      routes: options.routes,
      waitMs: options.waitMs,
      timeoutMs: options.timeoutMs,
      headless: options.headless,
      waitUntil: options.waitUntil,
      colorScheme: options.colorScheme,
      viewport: options.viewport,
      axeTags: options.axeTags,
      onlyRule: options.onlyRule,
      excludeSelectors: options.excludeSelectors,
      screenshotsDir: options.screenshotsDir,
      projectDir: options.projectDir,
      remotePackageJson,
      engines,
      includeWarnings: options.includeWarnings ?? options.includeIncomplete ?? false,
      clearCache: options.clearCache ?? false,
      serverMode: options.serverMode ?? false,
    },
    { onProgress },
  );

  // Step 2: Analyze + enrich
  if (onProgress) onProgress("intelligence", "running");

  const findingsPayload = runAnalyzer(scanPayload, {
    ignoreFindings: options.ignoreFindings,
    framework: options.framework,
    includeIncomplete: options.includeIncomplete,
  });

  // Step 3: Source patterns (optional) — works with local projectDir or remote repoUrl
  const hasSourceContext = (options.projectDir || options.repoUrl) && !options.skipPatterns;
  if (hasSourceContext) {
    if (onProgress) onProgress("patterns", "running");
    try {
      const { patterns } = loadAssetJson(ASSET_PATHS.remediation.codePatterns, "code-patterns.json");

      let resolvedFramework = options.framework;
      if (!resolvedFramework && findingsPayload.metadata?.projectContext?.framework) {
        resolvedFramework = findingsPayload.metadata.projectContext.framework;
      }

      let allPatternFindings = [];

      if (options.projectDir) {
        // Local filesystem scan
        const { resolveScanDirs, scanPattern } = await import("./source-patterns/source-scanner.mjs");
        const scanDirs = resolveScanDirs(resolvedFramework || null, options.projectDir);
        for (const pattern of patterns) {
          for (const scanDir of scanDirs) {
            allPatternFindings.push(...scanPattern(pattern, scanDir, options.projectDir));
          }
        }
      } else if (options.repoUrl) {
        // Remote GitHub API scan
        const { scanPatternRemote } = await import("./source-patterns/source-scanner.mjs");
        for (const pattern of patterns) {
          const remoteFindings = await scanPatternRemote(
            pattern,
            options.repoUrl,
            options.githubToken,
            resolvedFramework || null,
          );
          allPatternFindings.push(...remoteFindings);
        }
      }

      const confirmed = allPatternFindings.filter((f) => f.status === "confirmed").length;
      const potential = allPatternFindings.filter((f) => f.status === "potential").length;

      if (allPatternFindings.length > 0) {
        findingsPayload.patternFindings = {
          generated_at: new Date().toISOString(),
          project_dir: options.projectDir || options.repoUrl,
          findings: allPatternFindings,
          summary: { total: allPatternFindings.length, confirmed, potential },
        };
      }

      if (onProgress) onProgress("patterns", "done", {
        total: allPatternFindings.length,
        confirmed,
        potential,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (onProgress) onProgress("patterns", "skipped", { reason: msg });
      console.warn(`Source pattern scan failed (non-fatal): ${msg}`);
    }
  }

  if (onProgress) onProgress("intelligence", "done");

  // Step 4: AI enrichment (optional) — requires ANTHROPIC_API_KEY
  const aiOptions = options.ai || {};
  const aiEnabled = aiOptions.enabled !== false && !!aiOptions.apiKey;
  if (!aiEnabled && onProgress && options.ai !== undefined) {
    onProgress("ai", "skipped", { reason: "No API key configured" });
  }
  if (aiEnabled) {
    try {
      if (onProgress) onProgress("ai", "running");
      const { enrichWithAI } = await import("./ai/claude.mjs");

      const projectContext = findingsPayload.metadata?.projectContext || {};
      const rawFindings = getFindings(findingsPayload);

      const enrichedFindings = await enrichWithAI(
        rawFindings,
        {
          stack: {
            framework: projectContext.framework || null,
            cms: projectContext.cms || null,
            uiLibraries: projectContext.uiLibraries || [],
          },
          repoUrl: options.repoUrl,
        },
        {
          enabled: true,
          apiKey: aiOptions.apiKey,
          githubToken: aiOptions.githubToken || options.githubToken,
          model: aiOptions.model,
          audience: aiOptions.audience || "dev",
        }
      );

      // Store enriched findings back into the payload
      findingsPayload.ai_enriched_findings = enrichedFindings;
      if (onProgress) onProgress("ai", "done");
    } catch (err) {
      console.warn(`[a11y-engine] AI step failed (non-fatal): ${err.message}`);
    }
  }

  // Attach active engines to metadata so consumers know which ran
  findingsPayload.metadata = findingsPayload.metadata || {};
  findingsPayload.metadata.engines = engines;

  return findingsPayload;
}

// Report generation

import {
  normalizeFindings as normalizeForReports,
  buildSummary,
  computeComplianceScore,
  scoreLabel,
  buildPersonaSummary,
  wcagOverallStatus,
} from "./reports/renderers/findings.mjs";

/**
 * Generates a PDF report buffer from raw scan findings.
 * @param {{ findings: object[], metadata?: object }} payload
 * @param {{ baseUrl?: string, target?: string }} [options={}]
 * @returns {Promise<{ buffer: Buffer, contentType: "application/pdf" }>}
 */
export async function getPDFReport(payload, options = {}) {
  const { chromium } = await import("playwright");
  const {
    buildPdfCoverPage,
    buildPdfTableOfContents,
    buildPdfExecutiveSummary,
    buildPdfRiskSection,
    buildPdfRemediationRoadmap,
    buildPdfMethodologySection,
    buildPdfIssueSummaryTable,
    buildPdfNextSteps,
    buildPdfAuditLimitations,
  } = await import("./reports/renderers/pdf.mjs");

  const args = { baseUrl: options.baseUrl || "", target: options.target || "WCAG 2.2 AA" };
  const findings = normalizeForReports(payload).filter(
    (f) => f.wcagClassification !== "AAA" && f.wcagClassification !== "Best Practice",
  );

  const totals = buildSummary(findings);
  const score = computeComplianceScore(totals);
  let siteHostname = args.baseUrl;
  try { siteHostname = new URL(args.baseUrl.startsWith("http") ? args.baseUrl : `https://${args.baseUrl}`).hostname; } catch {}
  const coverDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Accessibility Audit — ${siteHostname}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:2cm}body{background:white;color:black;font-family:'Libre Baskerville',serif;font-size:11pt;line-height:1.6;margin:0;padding:0}h1,h2,h3,h4{font-family:'Inter',sans-serif;color:black;margin-top:1.5rem;margin-bottom:1rem}.cover-page{height:25.5cm;display:flex;flex-direction:column;page-break-after:always}.finding-entry{border-top:1pt solid black;padding-top:1.5rem;margin-top:2rem;page-break-inside:avoid}.severity-tag{font-weight:800;text-transform:uppercase;border:1.5pt solid black;padding:2pt 6pt;font-size:9pt;margin-bottom:1rem;display:inline-block}.remediation-box{background-color:#f3f4f6;border-left:4pt solid black;padding:1rem;margin:1rem 0;font-style:italic}pre{background:#f9fafb;border:1pt solid #ddd;padding:10pt;font-size:8pt;overflow:hidden;white-space:pre-wrap}.stats-table{width:100%;border-collapse:collapse;margin:2rem 0}.stats-table th,.stats-table td{border:1pt solid black;padding:10pt;text-align:left;font-size:9pt;font-family:'Inter',sans-serif}</style>
</head><body>
${buildPdfCoverPage({ siteHostname, target: args.target, score, wcagStatus: wcagOverallStatus(totals), coverDate })}
${buildPdfTableOfContents()}
${buildPdfExecutiveSummary(args, findings, totals)}
${buildPdfRiskSection(totals)}
${buildPdfRemediationRoadmap(findings)}
${buildPdfMethodologySection(args, findings)}
${buildPdfIssueSummaryTable(findings)}
${buildPdfNextSteps(findings, totals)}
${buildPdfAuditLimitations()}
</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
      displayHeaderFooter: false,
    });
    return {
      buffer: Buffer.from(pdfBuffer),
      contentType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}

/**
 * Generates a standalone manual accessibility checklist HTML string.
 * @param {{ baseUrl?: string }} [options={}]
 * @returns {Promise<{ html: string, contentType: "text/html" }>}
 */
export async function getChecklist(options = {}) {
  const { buildManualCheckCard } = await import("./reports/renderers/html.mjs");
  const { escapeHtml } = await import("./reports/renderers/utils.mjs");

  const manualChecks = loadAssetJson(ASSET_PATHS.reporting.manualChecks, "manual-checks.json");
  const siteLabel = options.baseUrl || "your site";
  const cards = manualChecks.map((c) => buildManualCheckCard(c)).join("\n");

  const TOTAL = manualChecks.length;
  const COUNT_A = manualChecks.filter((c) => c.level === "A").length;
  const COUNT_AA = manualChecks.filter((c) => c.level === "AA").length;
  const COUNT_AT = manualChecks.filter((c) => c.level === "AT").length;

  const selectClasses =
    "pl-4 pr-10 py-3 bg-white border border-slate-300 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-amber-500/20 focus:border-amber-400 shadow-sm transition-all appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23374151%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%3E%3Cpath%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Manual Accessibility Checklist &mdash; ${escapeHtml(siteLabel)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --amber: hsl(38, 92%, 50%); }
    html { scroll-padding-top: 80px; }
    body { background-color: #f8fafc; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .glass-header { background: rgba(255,255,255,0.85); backdrop-filter: blur(12px) saturate(180%); }
  </style>
</head>
<body class="text-slate-900 min-h-screen">
  <header class="fixed top-0 left-0 right-0 z-50 glass-header border-b border-slate-200/80 shadow-sm" id="navbar">
    <nav aria-label="Checklist header">
    <div class="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <div class="px-3 h-10 rounded-lg bg-slate-900 text-white font-bold text-base font-mono flex items-center justify-center shadow-md">a11y</div>
        <h1 class="text-xl font-bold">Manual <span class="text-slate-500">Checklist</span></h1>
      </div>
      <span class="text-sm text-slate-500 font-medium">${escapeHtml(siteLabel)}</span>
    </div>
    </nav>
  </header>
  <main id="main-content" class="max-w-4xl mx-auto px-4 pt-24 pb-20">
    <div class="mb-12">
      <h2 class="text-3xl font-extrabold mb-2">Manual Testing Checklist</h2>
      <p class="text-slate-600 text-base leading-relaxed max-w-2xl">Automated scans catch ~30-40% of accessibility issues. This checklist covers the rest: keyboard navigation, screen reader behaviour, cognitive flow and more.</p>
    </div>
    <div class="flex flex-wrap items-center gap-3 mb-8">
      <div class="flex items-center gap-1.5 text-sm font-semibold"><span class="inline-block w-3 h-3 rounded-full bg-slate-300"></span><span id="count-total">${TOTAL}</span> Total</div>
      <div class="flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><span class="inline-block w-3 h-3 rounded-full bg-emerald-400"></span><span id="count-pass">0</span> Pass</div>
      <div class="flex items-center gap-1.5 text-sm font-semibold text-rose-600"><span class="inline-block w-3 h-3 rounded-full bg-rose-400"></span><span id="count-fail">0</span> Fail</div>
      <div class="flex items-center gap-1.5 text-sm font-semibold text-amber-600"><span class="inline-block w-3 h-3 rounded-full bg-amber-400"></span><span id="count-na">0</span> N/A</div>
      <div class="ml-auto flex items-center gap-2">
        <select id="level-filter" class="${selectClasses}">
          <option value="all">All levels</option>
          <option value="A">Level A (${COUNT_A})</option>
          <option value="AA">Level AA (${COUNT_AA})</option>
          <option value="AT">Assistive Tech (${COUNT_AT})</option>
        </select>
      </div>
    </div>
    <div id="checklist-items" class="space-y-4">${cards}</div>
  </main>
  <script>
    const items = document.querySelectorAll('[data-check]');
    function updateProgress() {
      let pass=0,fail=0,na=0;
      items.forEach(el => { const s=el.dataset.status; if(s==='pass')pass++; else if(s==='fail')fail++; else if(s==='na')na++; });
      document.getElementById('count-pass').textContent=pass;
      document.getElementById('count-fail').textContent=fail;
      document.getElementById('count-na').textContent=na;
    }
    document.getElementById('level-filter').addEventListener('change',e=>{
      const v=e.target.value;
      items.forEach(el=>{el.style.display=(v==='all'||el.dataset.level===v)?'':'none';});
    });
    items.forEach(el=>{
      el.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const action=btn.dataset.action;
          el.dataset.status=el.dataset.status===action?'none':action;
          updateProgress();
        });
      });
    });
    updateProgress();
  <\/script>
</body>
</html>`;

  return {
    html,
    contentType: "text/html",
  };
}

// HTML Report

/**
 * Generates an interactive HTML audit dashboard from raw scan findings.
 * Embeds screenshots as base64 data URIs when available.
 * @param {{ findings: object[], metadata?: object }} payload - Raw scan output.
 * @param {{ baseUrl?: string, target?: string, screenshotsDir?: string }} [options={}]
 * @returns {Promise<{ html: string, contentType: "text/html" }>}
 */
export async function getHTMLReport(payload, options = {}) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { buildIssueCard, buildPageGroupedSection } = await import("./reports/renderers/html.mjs");
  const { escapeHtml } = await import("./reports/renderers/utils.mjs");

  const args = { baseUrl: options.baseUrl || "", target: options.target || "WCAG 2.2 AA" };
  const findings = normalizeForReports(payload).filter(
    (f) => f.wcagClassification !== "AAA" && f.wcagClassification !== "Best Practice",
  );

  // Embed screenshots as base64 if screenshotsDir is provided
  if (options.screenshotsDir) {
    for (const finding of findings) {
      if (finding.screenshotPath) {
        const filename = path.basename(finding.screenshotPath);
        const absolutePath = path.join(options.screenshotsDir, filename);
        try {
          if (fs.existsSync(absolutePath)) {
            const data = fs.readFileSync(absolutePath);
            finding.screenshotPath = `data:image/png;base64,${data.toString("base64")}`;
          } else {
            finding.screenshotPath = null;
          }
        } catch {
          finding.screenshotPath = null;
        }
      }
    }
  }

  // Dynamically import the html builder's buildHtml — it auto-executes main() on import,
  // so we replicate its logic here using the renderers directly.
  const {
    buildSummary: buildSummaryLocal,
    computeComplianceScore: computeScoreLocal,
    scoreLabel: scoreLabelLocal,
    buildPersonaSummary: buildPersonaSummaryLocal,
    wcagOverallStatus: wcagOverallStatusLocal,
  } = await import("./reports/renderers/findings.mjs");

  // Use the builder's internal buildHtml by re-importing it
  // Since html.mjs auto-runs main() on import, we cannot import it directly.
  // Instead, we construct the HTML using the same renderers.
  const totals = buildSummaryLocal(findings);
  const score = computeScoreLocal(totals);
  const label = scoreLabelLocal(score);
  const wcagStatus = wcagOverallStatusLocal(totals);
  const personaCounts = buildPersonaSummaryLocal(findings);

  let siteHostname = args.baseUrl;
  try {
    siteHostname = new URL(args.baseUrl.startsWith("http") ? args.baseUrl : `https://${args.baseUrl}`).hostname;
  } catch {}

  const pageGroups = {};
  for (const f of findings) {
    const area = f.area || "Unknown";
    if (!pageGroups[area]) pageGroups[area] = [];
    pageGroups[area].push(f);
  }

  const issueCards = findings.map((f) => buildIssueCard(f)).join("\n");
  const pageGroupedSections = Object.entries(pageGroups)
    .map(([area, group]) => buildPageGroupedSection(area, group))
    .join("\n");

  const quickWins = findings
    .filter((f) => (f.severity === "Critical" || f.severity === "Serious") && f.fixCode)
    .slice(0, 3);

  // Build a self-contained HTML report
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accessibility Audit — ${escapeHtml(siteHostname)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background: #f8fafc; }
  </style>
</head>
<body>
  <main class="max-w-5xl mx-auto px-4 py-12">
    <h1 class="text-3xl font-extrabold mb-2">Accessibility Audit Dashboard</h1>
    <p class="text-slate-500 mb-8">${escapeHtml(siteHostname)} — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="text-3xl font-black">${score}</div>
        <div class="text-xs font-bold text-slate-500 uppercase">${label}</div>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="text-3xl font-black">${findings.length}</div>
        <div class="text-xs font-bold text-slate-500 uppercase">Issues</div>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="text-3xl font-black ${wcagStatus === 'Pass' ? 'text-emerald-600' : 'text-rose-600'}">${wcagStatus}</div>
        <div class="text-xs font-bold text-slate-500 uppercase">WCAG 2.2</div>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="text-3xl font-black">${Object.keys(pageGroups).length}</div>
        <div class="text-xs font-bold text-slate-500 uppercase">Pages</div>
      </div>
    </div>
    <div class="space-y-4">
      ${pageGroupedSections}
    </div>
  </main>
</body>
</html>`;

  return {
    html,
    contentType: "text/html",
  };
}

// Remediation Guide (Markdown)

/**
 * Generates a Markdown remediation guide from raw scan findings.
 * @param {{ findings: object[], metadata?: object, incomplete_findings?: object[] }} payload
 * @param {{ baseUrl?: string, target?: string, patternFindings?: object }} [options={}]
 * @returns {Promise<{ markdown: string, contentType: "text/markdown" }>}
 */
export async function getRemediationGuide(payload, options = {}) {
  const { buildMarkdownSummary } = await import("./reports/renderers/md.mjs");

  const args = { baseUrl: options.baseUrl || "", target: options.target || "WCAG 2.2 AA" };
  const findings = normalizeForReports(payload);

  const markdown = buildMarkdownSummary(args, findings, {
    ...payload.metadata,
    incomplete_findings: payload.incomplete_findings,
    pattern_findings: options.patternFindings || null,
  });

  return {
    markdown,
    contentType: "text/markdown",
  };
}

// Source Pattern Scanner

/**
 * Scans a project's source code for accessibility patterns not detectable by axe-core.
 * @param {string} projectDir - Absolute path to the project root.
 * @param {{ framework?: string, onlyPattern?: string }} [options={}]
 * @returns {Promise<{ findings: object[], summary: { total: number, confirmed: number, potential: number } }>}
 */
export async function getSourcePatterns(projectDir, options = {}) {
  const { scanPattern, resolveScanDirs } = await import("./source-patterns/source-scanner.mjs");

  const { patterns } = loadAssetJson(ASSET_PATHS.remediation.codePatterns, "code-patterns.json");

  const activePatterns = options.onlyPattern
    ? patterns.filter((p) => p.id === options.onlyPattern)
    : patterns;

  if (activePatterns.length === 0) {
    return { findings: [], summary: { total: 0, confirmed: 0, potential: 0 } };
  }

  const scanDirs = resolveScanDirs(options.framework || null, projectDir);
  const allFindings = [];

  for (const pattern of activePatterns) {
    for (const scanDir of scanDirs) {
      allFindings.push(...scanPattern(pattern, scanDir, projectDir));
    }
  }

  const confirmed = allFindings.filter((f) => f.status === "confirmed").length;
  const potential = allFindings.filter((f) => f.status === "potential").length;

  return {
    findings: allFindings,
    summary: { total: allFindings.length, confirmed, potential },
  };
}
