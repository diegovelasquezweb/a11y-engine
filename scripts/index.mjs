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
function getAssets() {
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

// ---------------------------------------------------------------------------
// Finding enrichment
// ---------------------------------------------------------------------------

/**
 * Enriches findings with intelligence data (fix descriptions, fix code, category).
 * Each finding should have at minimum: { ruleId, sourceRuleId?, checkData?, fixDescription?, fixCode? }
 * @param {object[]} findings - Array of findings with camelCase keys.
 * @returns {object[]} Enriched findings.
 */
export function getEnrichedFindings(findings) {
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
export function getComplianceScore(totals) {
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
export function getPersonaGroups(findings) {
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

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

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
 * Requires Playwright (chromium) to render the PDF.
 * @param {{ findings: object[], metadata?: object }} payload - Raw scan output (snake_case keys).
 * @param {{ baseUrl?: string, target?: string }} [options={}]
 * @returns {Promise<Buffer>} The PDF as a Node.js Buffer.
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
 * Does not depend on scan results — reads from manual-checks.json asset.
 * @param {{ baseUrl?: string }} [options={}]
 * @returns {Promise<string>} The complete checklist HTML document.
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

  // Import the full checklist builder to reuse its buildHtml
  // The checklist builder module has a main() that auto-runs, so we dynamically
  // construct the same output using the renderer functions directly.
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
