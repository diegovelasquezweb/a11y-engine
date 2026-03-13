/**
 * @file analyzer.mjs
 * @description Post-scan data processor.
 * Transforms raw axe-core results into enriched findings by applying
 * framework-specific logic, remediation intelligence, and WCAG mapping
 * to generate a structured audit overview.
 */

import { log, readJson, writeJson, getInternalPath } from "../core/utils.mjs";
import { ASSET_PATHS, loadAssetJson } from "../core/asset-loader.mjs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to the core remediation intelligence database.
 * @type {string}
 */
const intelligencePath = ASSET_PATHS.remediation.intelligence;

/**
 * Path to the WCAG reference database: criterion maps, APG patterns, MDN links, personas.
 * @type {string}
 */
const wcagReferencePath = ASSET_PATHS.reporting.wcagReference;

const complianceConfigPath = ASSET_PATHS.reporting.complianceConfig;
const axeCheckMapsPath = ASSET_PATHS.remediation.axeCheckMaps;
const sourceBoundariesPath = ASSET_PATHS.remediation.sourceBoundaries;

let INTELLIGENCE;
let WCAG_REFERENCE;
let COMPLIANCE_CONFIG;
let AXE_CHECK_MAPS;
let SOURCE_BOUNDARIES;
INTELLIGENCE = loadAssetJson(
  intelligencePath,
  "assets/remediation/intelligence.json",
);

WCAG_REFERENCE = loadAssetJson(
  wcagReferencePath,
  "assets/reporting/wcag-reference.json",
);

COMPLIANCE_CONFIG = loadAssetJson(
  complianceConfigPath,
  "assets/reporting/compliance-config.json",
);

AXE_CHECK_MAPS = loadAssetJson(
  axeCheckMapsPath,
  "assets/remediation/axe-check-maps.json",
);

SOURCE_BOUNDARIES = loadAssetJson(
  sourceBoundariesPath,
  "assets/remediation/source-boundaries.json",
);

/**
 * Generates a stable unique ID for a finding based on the rule, URL, and selector.
 * @param {string} ruleId - The ID of the accessibility rule.
 * @param {string} url - The URL of the page where the violation was found.
 * @param {string} selector - The CSS selector of the violating element.
 * @returns {string} A short unique hash in the format A11Y-xxxxxx.
 */
function makeFindingId(ruleId, url, selector) {
  const stableSelector = selector.split(",")[0].trim();
  const key = `${ruleId}||${url}||${stableSelector}`;
  return `A11Y-${createHash("sha256").update(key).digest("hex").slice(0, 6)}`;
}

const RULES = INTELLIGENCE.rules || {};
const APG_PATTERNS = WCAG_REFERENCE.apgPatterns;
const MDN = WCAG_REFERENCE.mdn || {};
const WCAG_CRITERION_MAP = WCAG_REFERENCE.wcagCriterionMap || {};

function mergeUnique(first = [], second = []) {
  return [...new Set([...(first || []), ...(second || [])])];
}

function resolveGuardrails(target, shared) {
  if (target?.guardrails) return target.guardrails;
  if (!target?.guardrails_overrides && !shared) return null;
  return {
    must: mergeUnique(shared?.must, target?.guardrails_overrides?.must),
    must_not: mergeUnique(shared?.must_not, target?.guardrails_overrides?.must_not),
    verify: mergeUnique(shared?.verify, target?.guardrails_overrides?.verify),
  };
}

/**
 * Detects the programming language of a code snippet for syntax highlighting.
 * @param {string} code - The code snippet to analyze.
 * @returns {string} The detected language (html, jsx, or css).
 */
function detectCodeLang(code) {
  if (!code) return "html";
  if (/\.(tsx?|jsx?)\b|className=|useState|useRef|<>\s*<\/>/i.test(code))
    return "jsx";
  if (/^\s*[.#][\w-]+\s*\{|:\s*var\(|@media|display\s*:/m.test(code))
    return "css";
  return "html";
}

const IMPACTED_USERS = WCAG_REFERENCE.impactedUsers || {};
const EXPECTED = WCAG_REFERENCE.expected || {};

/**
 * Returns a description of the primary user groups impacted by a rule violation.
 * @param {string} ruleId - The ID of the accessibility rule.
 * @param {string[]} tags - The tags associated with the rule.
 * @returns {string} A description of the impacted users.
 */
function getImpactedUsers(ruleId, tags) {
  if (IMPACTED_USERS[ruleId]) return IMPACTED_USERS[ruleId];
  const tagFallbacks = WCAG_REFERENCE.tagImpactedUsers || {};
  for (const tag of tags) {
    if (tagFallbacks[tag]) return tagFallbacks[tag];
  }
  return "Users relying on assistive technology";
}

/**
 * Returns the expected accessibility behavior for a given rule.
 * @param {string} ruleId - The ID of the accessibility rule.
 * @returns {string} A description of the expected state for compliance.
 */
function getExpected(ruleId) {
  return EXPECTED[ruleId] || "WCAG accessibility check must pass.";
}

/**
 * Framework-specific file search glob patterns.
 * Used to help developers locate the source of an accessibility violation.
 * @type {Object<string, Object>}
 */
const FRAMEWORK_GLOBS = SOURCE_BOUNDARIES || {};

/**
 * Rules with managed_by_libraries in intelligence.json — derived at load time.
 * @type {Map<string, string[]>}
 */
const MANAGED_RULES = new Map(
  Object.entries(INTELLIGENCE.rules)
    .filter(([, rule]) => Array.isArray(rule.managed_by_libraries))
    .map(([id, rule]) => [id, rule.managed_by_libraries]),
);

const FRAMEWORK_NOTE_ALIASES = {
  nextjs: "react",
  gatsby: "react",
  nuxt: "vue",
};

function resolveFrameworkNotesKey(framework) {
  if (!framework) return null;
  return FRAMEWORK_NOTE_ALIASES[framework] || framework;
}

function resolveCmsNotesKey(framework) {
  if (!framework) return null;
  return framework;
}

/**
 * Filters the intelligence notes to only include those relevant to the detected framework.
 * @param {Object} notes - The notes object from intelligence.json.
 * @param {string} framework - The detected framework ID.
 * @returns {Object|null} A filtered notes object or null.
 */
function filterNotes(notes, framework) {
  if (!notes || typeof notes !== "object") return null;
  const intelKey = resolveFrameworkNotesKey(framework);
  if (intelKey && notes[intelKey]) return { [intelKey]: notes[intelKey] };
  const cmsKey = resolveCmsNotesKey(framework);
  if (cmsKey && notes[cmsKey]) return { [cmsKey]: notes[cmsKey] };
  return null;
}

/**
 * Returns the file search glob pattern for the given framework and code language.
 * @param {string} framework - The detected framework ID.
 * @param {string} codeLang - The detected code language (jsx, css, etc.).
 * @returns {string|null} The glob pattern or null if not found.
 */
function getFileSearchPattern(framework, codeLang) {
  const globs = FRAMEWORK_GLOBS[framework];
  if (!globs) return null;
  return codeLang === "css" ? globs.styles : globs.components;
}

/**
 * Checks if a rule is typically managed by a UI library like Radix or Headless UI.
 * Uses managed_by_libraries from intelligence.json instead of hardcoded lists.
 * @param {string} ruleId - The ID of the accessibility rule.
 * @param {string[]} uiLibraries - List of detected UI libraries.
 * @returns {string|null} The name of the managing library or null.
 */
function getManagedByLibrary(ruleId, uiLibraries) {
  const allowedLibs = MANAGED_RULES.get(ruleId);
  if (!allowedLibs) return null;
  const managed = uiLibraries.filter((lib) => allowedLibs.includes(lib));
  if (managed.length === 0) return null;
  return managed.join(", ");
}

/**
 * Extracts a component name hint from a CSS selector (e.g., from BEM classes).
 * @param {string} selector - The CSS selector to analyze.
 * @returns {string|null} A potential component name or null.
 */
const TAILWIND_UTILITY_RE =
  /^(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|w|h|min|max|gap|space|text|bg|border|rounded|shadow|opacity|z|top|right|bottom|left|flex|grid|items|justify|content|self|col|row|sr|group|peer|focus|hover|active|disabled|lg|md|sm|xl|font|leading|tracking|uppercase|lowercase|capitalize|truncate|overflow|relative|absolute|fixed|sticky|inset|block|inline|hidden|cursor|pointer|select|resize|transition|duration|ease|delay|animate|fill|stroke|ring|outline|divide|placeholder|caret|accent|appearance|list|break|whitespace|order|grow|shrink|basis|aspect|container|prose|line)-/i;

function isSemanticClass(value) {
  if (value.length <= 3) return false;
  if (/^\d/.test(value)) return false;
  if (TAILWIND_UTILITY_RE.test(value)) return false;
  return true;
}

function extractComponentHint(selector) {
  if (!selector || selector === "N/A") return null;
  // Strip attribute selector values to prevent false class matches (e.g. href$="facebook.com/")
  const stripped = selector.replace(/\[[^\]]*\]/g, "[]");
  // IDs are most semantic — check first
  const idMatch = stripped.match(/#([\w-]+)/);
  if (idMatch && idMatch[1].length > 3 && !/^\d/.test(idMatch[1])) return idMatch[1];
  // Scan all classes in the full selector chain, return first non-utility class
  const classes = [...stripped.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  for (const cls of classes) {
    if (isSemanticClass(cls)) return cls;
  }
  return null;
}

function derivePageHint(routePath) {
  if (!routePath || routePath === "/") return "homepage";
  const segment = routePath.replace(/^\//, "").split("/")[0];
  if (segment === "homepage") return "homepage";
  if (segment === "products") return "product-page";
  // Strip trailing long alphanumeric slugs (e.g. account/login → account-login)
  return routePath.replace(/^\//, "").replace(/\//g, "-").replace(/-[a-z0-9]{8,}(-[a-z0-9]+)*$/i, "") || segment;
}

/**
 * Prints the CLI usage instructions and available options for the analyzer.
 */
function printUsage() {
  log.info(`Usage:
  node analyzer.mjs --input <route-checks.json> [options]

Options:
  --output <path>          Output findings JSON path (default: .audit/a11y-findings.json)
  --ignore-findings <csv> Ignore specific rule IDs (overrides config)
  -h, --help               Show this help
`);
}

/**
 * Parses command-line arguments into a structured object for the analyzer.
 * @param {string[]} argv - Array of command-line arguments.
 * @returns {Object} A configuration object for the analyzer.
 */
function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const args = {
    input: getInternalPath("a11y-scan-results.json"),
    output: getInternalPath("a11y-findings.json"),
    ignoreFindings: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;

    if (key === "--input") args.input = value;
    if (key === "--output") args.output = value;
    if (key === "--ignore-findings")
      args.ignoreFindings = value.split(",").map((v) => v.trim());
    if (key === "--framework") args.framework = value;
    i += 1;
  }

  if (!args.input) throw new Error("Missing required --input");
  return args;
}

const IMPACT_MAP = COMPLIANCE_CONFIG.impactMap;

/**
 * Maps axe-core rule tags to a human-readable WCAG level string.
 * @param {string[]} tags - The tags associated with a violation.
 * @returns {string} The WCAG level (e.g., "WCAG 2.1 AA").
 */
function mapWcag(tags) {
  const labels = WCAG_REFERENCE.wcagTagLabels || {};
  const precedence = WCAG_REFERENCE.wcagTagPrecedence || Object.keys(labels);
  for (const key of precedence) {
    if (tags.includes(key) && labels[key]) return labels[key];
  }
  return "WCAG";
}

/**
 * Detects the implicit ARIA role of an HTML element if not explicitly specified.
 * @param {string} tag - The HTML tag name.
 * @param {string} html - The raw HTML of the element.
 * @returns {string|null} The implicit role or null.
 */
export function detectImplicitRole(tag, html) {
  if (!tag) return null;
  const roles = WCAG_REFERENCE.implicitRoles || {};
  if (tag === "input") {
    const type = html?.match(/type=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    return (roles.inputTypeMap || {})[type] ?? null;
  }
  return (roles.tagMap || {})[tag] ?? null;
}

/**
 * Extracts a simplified search target from a complex CSS selector to help locate it in code.
 * @param {string} selector - The complex CSS selector.
 * @returns {string} A simplified search string (e.g., "#my-id" or ".my-class").
 */
export function extractSearchHint(selector) {
  if (!selector || selector === "N/A") return selector;
  const specific =
    selector
      .split(/[\s>+~]+/)
      .filter(Boolean)
      .pop() || selector;
  const id = specific.match(/#([\w-]+)/)?.[1];
  if (id) return `id="${id}"`;
  const cls = specific.match(/\.([\w-]+)/)?.[1];
  if (cls) return `.${cls}`;
  const tag = specific.match(/^([a-z][a-z0-9-]*)/i)?.[1];
  if (tag) return `<${tag}`;
  return specific;
}

const FAILURE_MODE_MAP = AXE_CHECK_MAPS.failureModes || {};

const RELATIONSHIP_HINT_MAP = AXE_CHECK_MAPS.relationshipHints || {};

function normalizeFailureMessage(message) {
  if (!message) return null;
  return String(message).trim().replace(/\.$/, "");
}

function deriveRelationshipHint(checks = [], preferredChecks = []) {
  const preferredOrder = Array.isArray(preferredChecks)
    ? preferredChecks.filter(Boolean)
    : [];
  for (const checkId of preferredOrder) {
    if (checks.some((check) => check?.id === checkId) && RELATIONSHIP_HINT_MAP[checkId]) {
      return RELATIONSHIP_HINT_MAP[checkId];
    }
  }
  for (const check of checks) {
    if (check?.id && RELATIONSHIP_HINT_MAP[check.id]) {
      return RELATIONSHIP_HINT_MAP[check.id];
    }
  }
  return null;
}

/**
 * Extracts a compact explanation of why axe flagged a node.
 * @param {Object} node
 * @param {{ preferredRelationshipChecks?: string[] }} [options]
 * @returns {{ primaryFailureMode: string|null, relationshipHint: string|null, failureChecks: string[], relatedContext: string[] }}
 */
export function extractFailureInsights(node = {}, options = {}) {
  const checks = ["any", "all", "none"]
    .flatMap((bucket) => (Array.isArray(node[bucket]) ? node[bucket] : []))
    .filter(Boolean);

  if (checks.length === 0) {
    return {
      primaryFailureMode: null,
      relationshipHint: null,
      failureChecks: [],
      relatedContext: [],
      checkData: null,
    };
  }

  const primaryCheckId = checks[0]?.id || null;
  const primaryFailureMode = primaryCheckId
    ? FAILURE_MODE_MAP[primaryCheckId] || primaryCheckId.replace(/-/g, "_")
    : null;
  const relationshipHint = deriveRelationshipHint(
    checks,
    options.preferredRelationshipChecks || [],
  );

  const failureChecks = [
    ...new Set(
      checks
        .map((check) => normalizeFailureMessage(check.message))
        .filter(Boolean),
    ),
  ];

  const relatedContext = [
    ...new Set(
      checks
        .flatMap((check) =>
          Array.isArray(check.relatedNodes) ? check.relatedNodes : [],
        )
        .map((related) =>
          normalizeFailureMessage(
            related?.html ||
              (Array.isArray(related?.target) ? related.target.join(" ") : null),
          ),
        )
        .filter(Boolean),
    ),
  ];

  const checkData = (() => {
    const raw = checks[0]?.data ?? null;
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "object" && "isIframe" in raw) return null;
    return raw;
  })();

  return {
    primaryFailureMode,
    relationshipHint,
    failureChecks,
    relatedContext,
    checkData,
  };
}

function deriveSourceRoots(fileSearchPattern) {
  if (!fileSearchPattern) return [];
  return fileSearchPattern
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split("/**")[0].replace(/\*.*$/, "").replace(/\/$/, ""))
    .filter(Boolean);
}

function findCrossOriginFrameHost(html, pageUrl) {
  if (!html || !/<iframe\b/i.test(html)) return null;
  const src = html.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  if (!src) return null;
  try {
    const frameUrl = new URL(src, pageUrl);
    const pageOrigin = new URL(pageUrl).origin;
    return frameUrl.origin !== pageOrigin ? frameUrl.hostname : null;
  } catch {
    return null;
  }
}

/**
 * Classifies whether a finding appears to belong to the primary editable source.
 * @param {Object} input
 * @param {string[]} [input.evidenceHtml=[]]
 * @param {string} [input.selector=""]
 * @param {string} [input.pageUrl=""]
 * @param {string|null} [input.fileSearchPattern=null]
 * @returns {{ status: "primary" | "outside_primary_source" | "unknown", reason: string, searchStrategy: string, primarySourceScope: string[] }}
 */
export function classifyFindingOwnership({
  evidenceHtml = [],
  selector = "",
  pageUrl = "",
  fileSearchPattern = null,
} = {}) {
  const primarySourceScope = deriveSourceRoots(fileSearchPattern);
  const html = evidenceHtml.filter(Boolean).join(" ");
  const selectorText = String(selector || "");

  if (/wp-content\/plugins\//i.test(html)) {
    return {
      status: "outside_primary_source",
      reason: "The captured DOM references a WordPress plugin asset path, not the primary source tree.",
      searchStrategy: "verify_ownership_before_search",
      primarySourceScope,
    };
  }

  const crossOriginFrameHost = findCrossOriginFrameHost(html, pageUrl);
  if (crossOriginFrameHost) {
    return {
      status: "outside_primary_source",
      reason: `The element is rendered inside a cross-origin iframe from ${crossOriginFrameHost}.`,
      searchStrategy: "verify_ownership_before_search",
      primarySourceScope,
    };
  }

  if (
    /(^|[\s,>+~])iframe\b/i.test(selectorText) &&
    /src=["']https?:\/\//i.test(html)
  ) {
    return {
      status: "outside_primary_source",
      reason: "The finding targets an externally sourced iframe, which is usually outside the primary source tree.",
      searchStrategy: "verify_ownership_before_search",
      primarySourceScope,
    };
  }

  if (primarySourceScope.length === 0) {
    return {
      status: "unknown",
      reason: "The primary editable source could not be resolved for this project context.",
      searchStrategy: "verify_ownership_before_search",
      primarySourceScope,
    };
  }

  return {
    status: "primary",
    reason: `The finding should be addressed in the primary source tree (${primarySourceScope.join(", ")}).`,
    searchStrategy: "direct_source_patch",
    primarySourceScope,
  };
}

/**
 * Checks whether a single finding is a confirmed false positive based on evidence HTML patterns.
 * Only covers cases where the violation is provably impossible given the axe evidence.
 * @param {Object} finding - An enriched finding object.
 * @returns {boolean}
 */
function isFalsePositive(finding) {
  const htmls = finding.evidence.map((e) => e.html || "").join(" ");
  if (finding.rule_id === "color-contrast") {
    if (/background(?:-image)?\s*:\s*(?:linear|radial|conic)-gradient/i.test(htmls)) return true;
    if (/visibility\s*:\s*hidden|display\s*:\s*none/i.test(htmls)) return true;
  }
  return false;
}

/**
 * Removes confirmed false positives from findings.
 * @param {Object[]} findings
 * @returns {{ filtered: Object[], removedCount: number }}
 */
function filterFalsePositives(findings) {
  const filtered = [];
  let removedCount = 0;
  for (const finding of findings) {
    if (isFalsePositive(finding)) {
      removedCount++;
    } else {
      filtered.push(finding);
    }
  }
  return { filtered, removedCount };
}

/**
 * Deduplicates findings that fire on the same rule and element pattern across multiple pages.
 * Groups them into one representative finding with pages_affected and affected_urls.
 * @param {Object[]} findings
 * @returns {{ findings: Object[], deduplicatedCount: number }}
 */
function deduplicateFindings(findings) {
  function normalizeSelector(selector) {
    if (!selector) return "";
    return selector
      .replace(/:nth-child\(\d+\)/g, "")
      .replace(/:nth-of-type\(\d+\)/g, "")
      .replace(/\[\d+\]/g, "")
      .trim();
  }

  const UNGROUPABLE = new Set(["N/A", "", "html", "body", ":root", "document"]);

  const groups = new Map();
  for (const finding of findings) {
    const normalized = normalizeSelector(finding.primary_selector);
    const key = UNGROUPABLE.has(normalized)
      ? `__ungroupable__${finding.id}`
      : `${finding.rule_id}||${normalized}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }

  const result = [];
  let deduplicatedCount = 0;
  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      const representative = group.reduce((best, f) =>
        (f.total_instances || 1) >= (best.total_instances || 1) ? f : best,
      );
      const affectedUrls = [...new Set(group.map((f) => f.url))];
      const totalInstances = group.reduce((sum, f) => sum + (f.total_instances || 1), 0);
      result.push({
        ...representative,
        total_instances: totalInstances,
        pages_affected: affectedUrls.length,
        affected_urls: affectedUrls,
      });
      deduplicatedCount++;
    }
  }
  return { findings: result, deduplicatedCount };
}

/**
 * Computes the overall WCAG compliance assessment.
 * @param {Object[]} findings
 * @returns {'Fail' | 'Conditional Pass' | 'Pass'}
 */
function computeOverallAssessment(findings) {
  const wcagFindings = findings.filter(
    (f) => f.wcag_classification !== "Best Practice" && f.wcag_classification !== "AAA",
  );
  if (wcagFindings.some((f) => f.severity === "Critical" || f.severity === "Serious")) return "Fail";
  if (wcagFindings.length > 0) return "Conditional Pass";
  return "Pass";
}

/**
 * Aggregates WCAG 2.2 AA criteria that passed across all scanned routes.
 * @param {Object[]} routes - Raw scan routes with a passes array of rule IDs.
 * @param {Object<string, string>} wcagCriterionMap - Map from rule_id to WCAG criterion ID.
 * @returns {string[]} Sorted unique WCAG criterion IDs that passed.
 */
function computePassedCriteria(routes, wcagCriterionMap, activeFindings = []) {
  const passed = new Set();
  for (const route of routes) {
    for (const ruleId of route.passes || []) {
      const criterion = wcagCriterionMap[ruleId];
      if (criterion) passed.add(criterion);
    }
  }
  for (const finding of activeFindings) {
    const criterion = wcagCriterionMap[finding.rule_id];
    if (criterion) passed.delete(criterion);
  }
  return [...passed].sort();
}

/**
 * Computes out-of-scope information: errored routes and AAA exclusion flag.
 * @param {Object[]} routes - Raw scan routes.
 * @returns {Object}
 */
function computeOutOfScope(routes) {
  const authBlockedRoutes = routes
    .filter((r) => r.error)
    .map((r) => r.url || r.path)
    .filter(Boolean);
  return {
    auth_blocked_routes: authBlockedRoutes,
    aaa_excluded: true,
  };
}

/**
 * Classifies a finding's WCAG status based on axe rule tags.
 * @param {string[]} tags - The violation's axe tags.
 * @param {string|null} wcagCriterionId - The mapped WCAG criterion ID.
 * @returns {'Best Practice' | 'AAA' | null} null = standard AA/A finding.
 */
function classifyWcag(tags, wcagCriterionId) {
  const isWcagAorAA = tags.some((t) => /^wcag\d+(a|aa)$/.test(t));
  if (isWcagAorAA) return null;
  if (tags.includes("best-practice")) return "Best Practice";
  if (tags.some((t) => /aaa/i.test(t))) return "AAA";
  if (!wcagCriterionId) return "Best Practice";
  return null;
}

/**
 * Identifies single-point-fix opportunities and systemic WCAG patterns from findings.
 * @param {Object[]} findings - Deduplicated enriched findings.
 * @returns {{ single_point_fixes: Object[], systemic_patterns: Object[] }}
 */
function computeRecommendations(findings) {
  const componentGroups = new Map();
  for (const f of findings) {
    if (!f.component_hint) continue;
    if (!componentGroups.has(f.component_hint)) componentGroups.set(f.component_hint, []);
    componentGroups.get(f.component_hint).push(f);
  }

  const singlePointFixes = [];
  for (const [component, group] of componentGroups) {
    const maxPages = Math.max(...group.map((f) => f.pages_affected || 1));
    if (group.length < 2 && maxPages < 3) continue;
    singlePointFixes.push({
      component,
      total_issues: group.length,
      total_pages: maxPages,
      rules: [...new Set(group.map((f) => f.rule_id))],
      severities: [...new Set(group.map((f) => f.severity))],
    });
  }
  singlePointFixes.sort((a, b) => (b.total_issues * b.total_pages) - (a.total_issues * a.total_pages));

  const criterionGroups = new Map();
  for (const f of findings) {
    if (!f.wcag_criterion_id) continue;
    if (!criterionGroups.has(f.wcag_criterion_id)) criterionGroups.set(f.wcag_criterion_id, []);
    criterionGroups.get(f.wcag_criterion_id).push(f);
  }

  const systemicPatterns = [];
  for (const [criterion, group] of criterionGroups) {
    if (group.length < 3) continue;
    const components = [...new Set(group.map((f) => f.component_hint).filter(Boolean))];
    if (components.length < 2) continue;
    systemicPatterns.push({
      wcag_criterion: criterion,
      total_issues: group.length,
      affected_components: components,
      rules: [...new Set(group.map((f) => f.rule_id))],
    });
  }
  systemicPatterns.sort((a, b) => b.total_issues - a.total_issues);

  return { single_point_fixes: singlePointFixes, systemic_patterns: systemicPatterns };
}

/**
 * Auto-generates testing methodology metadata from the raw scan payload.
 * @param {Object} payload - Raw scan payload from dom-scanner.mjs.
 * @returns {Object}
 */
function computeTestingMethodology(payload) {
  const routes = payload.routes || [];
  const scanned = routes.filter((r) => !r.error).length;
  const errored = routes.filter((r) => r.error).length;
  return {
    automated_tools: ["axe-core (via @axe-core/playwright)", "Playwright + Chromium"],
    compliance_target: "WCAG 2.2 AA",
    pages_scanned: scanned,
    pages_errored: errored,
    framework_detected: payload.projectContext?.framework || "Not detected",
    manual_testing: "Not performed (automated scan only)",
    assistive_tech_tested: "None (automated scan only)",
  };
}

/**
 * Processes scan results into a high-level auditing findings object.
 * Enriches findings with intelligence metadata, framework notes, and fix recommendations.
 * @param {Object} inputPayload - The raw JSON payload from dom-scanner.mjs.
 * @param {Object} cliArgs - Arguments passed to the analyzer.
 * @returns {Object} A structured object containing findings and metadata.
 */
function buildFindings(inputPayload, cliArgs) {
  const onlyRule = inputPayload.onlyRule;
  const routes = inputPayload.routes || [];
  const ctx = inputPayload.projectContext || {
    framework: null,
    uiLibraries: [],
  };
  if (cliArgs?.framework) ctx.framework = cliArgs.framework;
  const findings = [];

  for (const route of routes) {
    if (route.violations) {
      for (const v of route.violations) {
        const nodes = v.nodes || [];
        const selectors = nodes.map((n) => n.target.join(" ")).slice(0, 5);
        const scoreSelectorSpecificity = (s) => {
          if (!s || s === "N/A") return -1;
          let score = 0;
          if (/#[\w-]+/.test(s)) score += 100;
          if (/\[data-[\w-]+/.test(s)) score += 80;
          if (/\[aria-[\w-]+/.test(s)) score += 60;
          if (/\[(name|role|type)=/.test(s)) score += 40;
          const tailwindPattern = /(^|\s|\.)(sm:|md:|lg:|xl:|2xl:|focus:|hover:|active:|disabled:|group-|peer-|\w+-\d+|[pmwh][xytblr]?-|text-(xs|sm|base|lg|xl|\d)|bg-|border-|rounded|shadow|opacity-|flex-?|grid-?|items-|justify-|gap-|space-|z-\d|leading-|tracking-|font-|w-|h-|min-|max-|top-|right-|bottom-|left-|translate-|rotate-|scale-|skew-)/;
          if (tailwindPattern.test(s)) score -= 40;
          score -= s.length * 0.1;
          return score;
        };
        const bestSelector = selectors.reduce((best, s) =>
          scoreSelectorSpecificity(s) > scoreSelectorSpecificity(best) ? s : best,
        selectors[0] || "N/A");
        const firstNode = nodes[0];
        const explicitRole =
          firstNode?.html?.match(/role=["']([^"']+)["']/)?.[1] ?? null;
        const tag =
          firstNode?.html?.match(/^<([a-z][a-z0-9-]*)/i)?.[1]?.toLowerCase() ??
          null;
        const role = explicitRole ?? detectImplicitRole(tag, firstNode?.html);
        const apgUrl = role ? APG_PATTERNS[role] : null;

        const ruleInfo = RULES[v.id] || {};
        const fixInfo = ruleInfo.fix || {};
        const resolvedGuardrails = resolveGuardrails(ruleInfo, null);

        let recFix = apgUrl
          ? `Reference: ${apgUrl}`
          : v.helpUrl
            ? `See ${v.helpUrl}`
            : "Fix the violation.";

        const codeLang = detectCodeLang(fixInfo.code);
        const fileSearchPattern = getFileSearchPattern(ctx.framework, codeLang);
        const ownership = classifyFindingOwnership({
          evidenceHtml: nodes.map((n) => n.html || ""),
          selector: bestSelector,
          pageUrl: route.url,
          fileSearchPattern,
        });
        const failureInsights = extractFailureInsights(firstNode, {
          preferredRelationshipChecks: ruleInfo.preferred_relationship_checks || [],
        });

        findings.push({
          id: "",
          rule_id: v.id,
          title: v.help,
          severity: IMPACT_MAP[v.impact] || "Medium",
          wcag: mapWcag(v.tags),
          wcag_criterion_id: WCAG_CRITERION_MAP[v.id] ?? null,
          wcag_classification: classifyWcag(v.tags, WCAG_CRITERION_MAP[v.id] ?? null),
          area: `${route.path}`,
          url: route.url,
          selector: selectors.join(", "),
          impacted_users: getImpactedUsers(v.id, v.tags),
          primary_selector: bestSelector,
          actual:
            firstNode?.failureSummary || `Found ${nodes.length} instance(s).`,
          primary_failure_mode: failureInsights.primaryFailureMode,
          relationship_hint: failureInsights.relationshipHint,
          failure_checks: failureInsights.failureChecks,
          related_context: failureInsights.relatedContext,
          expected: getExpected(v.id),
          category: ruleInfo.category ?? null,
          fix_description: fixInfo.description ?? null,
          fix_code: fixInfo.code ?? null,
          fix_code_lang: codeLang,
          recommended_fix: recFix.trim(),
          mdn: MDN[v.id] ?? null,
          effort: null,
          related_rules: Array.isArray(ruleInfo.related_rules)
            ? ruleInfo.related_rules
            : [],
          guardrails: resolvedGuardrails,
          false_positive_risk: ruleInfo.false_positive_risk ?? null,
          fix_difficulty_notes: ruleInfo.fix_difficulty_notes ?? null,
          framework_notes: filterNotes(ruleInfo.framework_notes, ctx.framework),
          cms_notes: filterNotes(ruleInfo.cms_notes, ctx.framework),
          check_data: failureInsights.checkData,
          total_instances: nodes.length,
          evidence: nodes.slice(0, 3).map((n) => ({
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary,
            ancestry: n.ancestry?.[0] ?? null,
          })),
          screenshot_path: v.screenshot_path || null,
          file_search_pattern:
            ownership.status === "primary" ? fileSearchPattern : null,
          managed_by_library: getManagedByLibrary(v.id, ctx.uiLibraries),
          ownership_status: ownership.status,
          ownership_reason: ownership.reason,
          primary_source_scope: ownership.primarySourceScope,
          search_strategy: ownership.searchStrategy,
          component_hint: extractComponentHint(bestSelector) ?? derivePageHint(route.path),
          verification_command: `pnpm a11y --base-url ${route.url} --routes ${route.path} --only-rule ${v.id} --max-routes 1`,
          verification_command_fallback: `node scripts/audit.mjs --base-url ${route.url} --routes ${route.path} --only-rule ${v.id} --max-routes 1`,
        });
      }
    }

  }

  return {
    findings: findings.map((f) => ({
      ...f,
      id: makeFindingId(f.rule_id || f.title, f.url, f.selector),
    })),
      metadata: {
        scanDate: new Date().toISOString(),
        checklist: "https://www.a11yproject.com/checklist/",
        projectContext: ctx,
      },
  };
}

/**
 * Collects and deduplicates incomplete (needs-review) violations from raw scan routes.
 * @param {Object[]} routes
 * @returns {Object[]}
 */
export function collectIncompleteFindings(routes) {
  const groups = new Map();
  for (const route of routes) {
    for (const v of (route.incomplete || [])) {
      const firstNode = v.nodes?.[0];
      const message =
        firstNode?.any?.[0]?.message ??
        firstNode?.all?.[0]?.message ??
        firstNode?.none?.[0]?.message ??
        null;
      const key = `${v.id}||${message ?? v.description ?? ""}`;
      if (!groups.has(key)) {
        const selector = Array.isArray(firstNode?.target)
          ? firstNode.target.join(" ")
          : "N/A";
        groups.set(key, {
          rule_id: v.id,
          title: v.help,
          description: v.description,
          impact: v.impact ?? null,
          selector,
          message,
          areas: new Set(),
        });
      }
      groups.get(key).areas.add(route.path);
    }
  }
  return [...groups.values()].map((g) => ({
    rule_id: g.rule_id,
    title: g.title,
    description: g.description,
    impact: g.impact,
    selector: g.selector,
    message: g.message,
    pages_affected: g.areas.size,
    areas: [...g.areas],
  }));
}

/**
 * The main execution function for the analyzer script.
 * Reads scan results, processes findings, and writes the final findings JSON.
 */
function main() {
  const args = parseArgs(process.argv.slice(2));
  const ignoredRules = new Set(args.ignoreFindings);

  const payload = readJson(args.input);
  if (!payload) throw new Error(`Input not found or invalid: ${args.input}`);

  const result = buildFindings(payload, args);

  if (ignoredRules.size > 0) {
    const knownIds = new Set(
      result.findings.map((f) => f.rule_id).filter(Boolean),
    );
    for (const r of ignoredRules) {
      if (!knownIds.has(r))
        log.warn(`ignoreFindings: rule "${r}" not found in this scan — typo?`);
    }
  }

  let findings =
    ignoredRules.size > 0
      ? result.findings.filter((f) => !ignoredRules.has(f.rule_id))
      : result.findings;

  if (ignoredRules.size > 0 && result.findings.length !== findings.length) {
    log.info(
      `Ignored ${result.findings.length - findings.length} finding(s) via ignoreFindings config.`,
    );
  }

  const { filtered: fpFiltered, removedCount: fpRemovedCount } = filterFalsePositives(findings);
  if (fpRemovedCount > 0) log.info(`Removed ${fpRemovedCount} confirmed false positive(s).`);

  const { findings: dedupedFindings, deduplicatedCount } = deduplicateFindings(fpFiltered);
  if (deduplicatedCount > 0) log.info(`Deduplicated ${deduplicatedCount} cross-page finding group(s).`);

  const overallAssessment = computeOverallAssessment(dedupedFindings);
  const passedCriteria = computePassedCriteria(payload.routes || [], WCAG_CRITERION_MAP, dedupedFindings);
  const outOfScope = computeOutOfScope(payload.routes || []);
  const recommendations = computeRecommendations(dedupedFindings);
  const testingMethodology = computeTestingMethodology(payload);
  const incompleteFindings = collectIncompleteFindings(payload.routes || []);
  if (incompleteFindings.length > 0)
    log.info(`${incompleteFindings.length} incomplete finding(s) require manual review.`);

  writeJson(args.output, {
    ...result,
    findings: dedupedFindings,
    incomplete_findings: incompleteFindings,
    metadata: {
      ...result.metadata,
      overallAssessment,
      passedCriteria,
      outOfScope,
      recommendations,
      testingMethodology,
      fpFiltered: fpRemovedCount,
      deduplicatedCount,
    },
  });

  if (dedupedFindings.length === 0) {
    log.info("Congratulations, no issues found.");
  }
  log.success(`Findings processed and saved to ${args.output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}
