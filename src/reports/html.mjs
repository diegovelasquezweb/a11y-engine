/**
 * @file report-html.mjs
 * @description Generates a high-fidelity, interactive HTML accessibility audit report.
 * It processes the audit findings, calculates compliance scores, and applies
 * a premium design system with persona-based impact analysis.
 */

import { log, readJson, getInternalPath, DEFAULTS } from "../core/utils.mjs";
import { ASSET_PATHS, loadAssetJson } from "../core/asset-loader.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeFindings,
  buildSummary,
  computeComplianceScore,
  scoreLabel,
  buildPersonaSummary,
  wcagOverallStatus,
} from "./renderers/findings.mjs";
import { escapeHtml } from "./renderers/utils.mjs";

const RULE_METADATA = loadAssetJson(
  ASSET_PATHS.reporting.wcagReference,
  "assets/reporting/wcag-reference.json",
);

import {
  buildIssueCard,
  buildPageGroupedSection,
} from "./renderers/html.mjs";

/**
 * Prints the CLI usage instructions and available options for the HTML report builder.
 */
function printUsage() {
  log.info(`Usage:
  node report-html.mjs [options]

Options:
  --input <path>           Findings JSON path (default: .audit/a11y-findings.json)
  --output <path>          Output HTML path (required)
  --target <text>          Compliance target label (default: WCAG 2.2 AA)
  -h, --help               Show this help
`);
}

/**
 * Parses command-line arguments into a structured configuration object for the HTML builder.
 * @param {string[]} argv - Array of command-line arguments.
 * @returns {Object} A configuration object containing input/output paths and target settings.
 */
function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const args = {
    input: getInternalPath("a11y-findings.json"),
    output: "",
    baseUrl: "",
    target: DEFAULTS.complianceTarget,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;

    if (key === "--input") args.input = value;
    if (key === "--output") args.output = value;
    if (key === "--base-url") args.baseUrl = value;
    if (key === "--target") args.target = value;
    i += 1;
  }

  return args;
}

/**
 * Constructs the final HTML string for the accessibility report.
 * @param {Object} args - The parsed CLI arguments.
 * @param {Object[]} findings - The normalized list of audit findings.
 * @param {Object} [metadata={}] - Optional metadata from the scan (e.g., date, target).
 * @returns {string} The complete HTML document as a string.
 */
function buildHtml(args, findings, metadata = {}) {
  const totals = buildSummary(findings);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasIssues = findings.length > 0;

  let siteHostname = args.baseUrl;
  try {
    /** @type {URL} */
    const urlObj = new URL(
      args.baseUrl.startsWith("http")
        ? args.baseUrl
        : `https://${args.baseUrl}`,
    );
    siteHostname = urlObj.hostname;
  } catch {}

  const statusColor = hasIssues
    ? "text-rose-700 bg-rose-50 border-rose-200"
    : "text-emerald-600 bg-emerald-50 border-emerald-200";
  const statusIcon = hasIssues
    ? `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`
    : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  const statusText = hasIssues ? "WCAG Violations Found" : "Audit Passed";

  /** @type {Object<string, number>} */
  const _pageCounts = {};
  for (const f of findings) {
    _pageCounts[f.area] = (_pageCounts[f.area] || 0) + 1;
  }
  const _sortedPages = Object.entries(_pageCounts).sort((a, b) => b[1] - a[1]);

  /**
   * Tailwind classes for the select inputs.
   * @type {string}
   */
  const selectClasses =
    "pl-4 pr-10 py-3 bg-white border border-slate-300 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 focus:border-[var(--primary)] shadow-sm transition-all appearance-none cursor-pointer relative bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23374151%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%3E%3Cpath%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat";

  /**
   * HTML markup for the page filter dropdown.
   * @type {string}
   */
  const pageSelectHtml =
    _sortedPages.length > 1
      ? `<div id="page-select-container" style="display:none" class="flex items-center gap-2 shrink-0">
          <label for="page-select" class="text-xs font-bold text-slate-600 uppercase tracking-widest hidden sm:block whitespace-nowrap">Page:</label>
          <select id="page-select" onchange="filterByPage(this.value)" class="${selectClasses}">
            <option value="all">All pages (${_sortedPages.length})</option>
            ${_sortedPages.map(([pg, cnt]) => `<option value="${escapeHtml(pg)}">${escapeHtml(pg)} (${cnt})</option>`).join("")}
          </select>
        </div>`
      : "";

  const score = computeComplianceScore(totals);
  const label = scoreLabel(score);
  const wcagStatus = wcagOverallStatus(totals);
  /**
   * The hue value for the compliance score gauge (green for high, orange for medium, red for low).
   * @type {number}
   */
  const scoreHue = wcagStatus === "Fail" ? 0 : score >= 75 ? 142 : score >= 55 ? 38 : 0;

  /**
   * Summary of issues grouped by user persona impact.
   * @type {Object}
   */
  const personaCounts = buildPersonaSummary(findings);

  /**
   * Configuration for the persona impact matrix UI.
   * @type {Object}
   */
  const personaGroups = {};
  for (const [key, cfg] of Object.entries(RULE_METADATA.personaConfig)) {
    personaGroups[key] = { label: cfg.label, count: personaCounts[key] || 0, icon: cfg.icon };
  }

  const quickWins = findings
    .filter(
      (f) => (f.severity === "Critical" || f.severity === "Serious") && f.fixCode,
    )
    .slice(0, 3);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Web Accessibility Audit &mdash; ${escapeHtml(siteHostname)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
        --primary-h: 226;
        --primary-s: 70%;
        --primary-l: 50%;
        --primary: hsl(var(--primary-h), var(--primary-s), var(--primary-l));
        --primary-light: hsl(var(--primary-h), var(--primary-s), 95%);
        --primary-dark: hsl(var(--primary-h), var(--primary-s), 30%);
        --slate-50: #f8fafc;
        --slate-100: #f1f5f9;
        --slate-200: #e2e8f0;
        --slate-300: #cbd5e1;
        --slate-400: #94a3b8;
        --slate-500: #64748b;
        --slate-600: #475569;
        --slate-700: #334155;
        --slate-800: #1e293b;
        --slate-900: #0f172a;
      }
      html { scroll-padding-top: 80px; }
      body { background-color: var(--slate-50); font-family: 'Outfit', 'Inter', sans-serif; -webkit-font-smoothing: antialiased; letter-spacing: -0.011em; }
      .glass-header { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%); }
      .premium-card { background: white; border: 1px solid var(--slate-200); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      .premium-card:hover { transform: translateY(-2px); border-color: var(--slate-300); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04); }
      .issue-card { position: relative; transition: all 0.3s ease; }
      .issue-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; border-radius: 4px 0 0 4px; opacity: 0.8; }
      .issue-card[data-severity="Critical"]::before { background: #e11d48; }
      .issue-card[data-severity="Serious"]::before { background: #f97316; }
      .issue-card[data-severity="Moderate"]::before { background: #f59e0b; }
      .issue-card[data-severity="Minor"]::before { background: #10b981; }

      .score-gauge { transform: rotate(-90deg); }
      .score-gauge-bg { fill: none; stroke: var(--slate-100); stroke-width: 3; }
      .score-gauge-val { fill: none; stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray 1s ease-out; }
  </style>
  <script type="application/ld+json">
  ${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Report",
      name: "Web Accessibility Audit Report",
      about: args.baseUrl || siteHostname,
      dateCreated: metadata.scanDate || new Date().toISOString(),
      hasPart: findings.map((f) => ({
        "@type": "CreativeWork",
        identifier: f.id,
        name: f.title,
        description: f.impact,
        url: f.url,
        keywords: [f.severity, f.wcag, f.ruleId].filter(Boolean).join(", "),
      })),
    },
    null,
    2,
  )}
  </script>
</head>
<body class="text-slate-900 min-h-screen">

  <header class="fixed top-0 left-0 right-0 z-50 glass-header border-b border-slate-200/80 shadow-sm" id="navbar">
    <nav aria-label="Report header">
      <div class="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="px-3 h-10 rounded-lg bg-slate-900 text-white font-bold text-base font-mono flex items-center justify-center shadow-md">a11y</div>
          <h1 class="text-xl font-bold">Web Accessibility <span class="text-slate-500">Audit</span></h1>
        </div>
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusColor}">
          ${statusIcon} <span>${statusText}</span>
        </div>
      </div>
    </nav>
  </header>

    <main id="main-content" class="max-w-7xl mx-auto px-4 pt-24 pb-20">
      <div class="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-3xl font-extrabold mb-2">Web Accessibility Audit</h2>
          <p class="text-slate-500">${dateStr} &bull; ${escapeHtml(args.baseUrl)}</p>
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-12">
        <!-- 1. Score & Main Stats -->
        <div class="xl:col-span-8 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div class="md:col-span-5 premium-card rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-5">
              <svg class="w-32 h-32 text-slate-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            </div>
            <div class="relative w-32 h-32 mb-4">
              <svg class="w-full h-full score-gauge" viewBox="0 0 36 36">
                <circle class="score-gauge-bg" cx="18" cy="18" r="16" />
                <circle class="score-gauge-val" cx="18" cy="18" r="16"
                  stroke="hsl(${scoreHue}, 70%, 50%)"
                  stroke-dasharray="${score}, 100" />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-4xl font-extrabold text-slate-900">${score}</span>
                <span class="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Score</span>
              </div>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-1">${label} Compliance</h3>
            <p class="text-xs font-medium text-slate-500 max-w-[200px] leading-snug">Automated testing coverage based on ${escapeHtml(args.target)} technical checks.</p>
          </div>

          <div class="md:col-span-7 grid grid-cols-2 gap-4">
            <div class="premium-card p-5 rounded-2xl border-l-[6px] border-rose-500">
              <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Critical</span>
              </div>
              <div class="text-4xl font-black text-slate-900">${totals.Critical}</div>
              <p class="text-[10px] text-slate-600 font-medium mt-1 leading-tight">Functional blockers</p>
            </div>
            <div class="premium-card p-5 rounded-2xl border-l-[6px] border-orange-500">
              <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] font-bold text-orange-700 uppercase tracking-widest">Serious</span>
              </div>
              <div class="text-4xl font-black text-slate-900">${totals.Serious}</div>
              <p class="text-[10px] text-slate-600 font-medium mt-1 leading-tight">Serious impediments</p>
            </div>
            <div class="premium-card p-5 rounded-2xl border-l-[6px] border-amber-400">
              <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Moderate</span>
              </div>
              <div class="text-4xl font-black text-slate-900">${totals.Moderate}</div>
              <p class="text-[10px] text-slate-600 font-medium mt-1 leading-tight">Significant friction</p>
            </div>
            <div class="premium-card p-5 rounded-2xl border-l-[6px] border-emerald-500">
              <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Minor</span>
              </div>
              <div class="text-4xl font-black text-slate-900">${totals.Minor}</div>
              <p class="text-[10px] text-slate-600 font-medium mt-1 leading-tight">Minor violations</p>
            </div>
          </div>
        </div>

        <!-- 2. Persona Impact -->
        <div class="xl:col-span-4 premium-card rounded-2xl p-6">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Persona Impact Matrix
          </h3>
          <p class="text-xs text-slate-600 mb-6 -mt-4 leading-relaxed italic">Distribution of unique accessibility barriers per user profile. Duplicate errors are grouped to show strategic impact.</p>
          <div class="space-y-4">
            ${Object.entries(personaGroups)
              .map(
                ([, p]) => `
            <div class="group">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-[var(--primary-light)] group-hover:text-[var(--primary)] transition-colors">${p.icon}</div>
                  <span class="text-sm font-bold text-slate-700">${p.label}</span>
                </div>
                <span class="text-xs font-black text-slate-900">${p.count} issues</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div class="bg-[var(--primary)] h-full rounded-full transition-all duration-500" style="width: ${findings.length > 0 ? (p.count / findings.length) * 100 : 0}%"></div>
              </div>
            </div>`,
              )
              .join("")}
          </div>
        </div>
      </div>

      <!-- Quick Wins Banner (Actionable Insight) -->
      ${
        quickWins.length > 0
          ? `
      <div class="premium-card rounded-2xl bg-slate-900 p-6 mb-12 relative overflow-hidden">
        <div class="absolute -right-4 -bottom-4 opacity-10">
          <svg class="w-32 h-32 text-[var(--primary)]" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <div class="relative z-10">
          <div class="flex items-center gap-3 mb-4">
            <span class="px-2 py-0.5 rounded bg-[var(--primary)] text-[10px] font-black text-white uppercase tracking-tighter">AI Analysis</span>
            <h3 class="text-xl font-bold text-white">Recommended Quick Wins</h3>
          </div>
          <p class="text-xs text-[var(--primary)]/80 mb-6 -mt-2 leading-relaxed italic">High-priority issues with ready-to-use code fixes for immediate remediation.</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${quickWins
              .map(
                (w) => `
            <div class="bg-slate-800/50 border border-slate-700 p-4 rounded-xl backdrop-blur-sm">
              <div class="flex items-center justify-between mb-2">
                <span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[9px] font-bold uppercase tracking-tight line-clamp-1">${w.severity}</span>
                <span class="text-slate-300 text-[9px] font-mono">${w.id}</span>
              </div>
              <h4 class="text-sm font-bold text-slate-200 mb-1 line-clamp-1">${w.title}</h4>
              <p class="text-[10px] text-slate-300 font-mono mb-3 truncate">Page: ${w.area}</p>
              <button onclick="scrollToIssue('${w.id}')" class="text-[10px] font-bold text-blue-300 hover:text-blue-200 transition-colors uppercase tracking-widest flex items-center gap-1">
                View Solution
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>`,
              )
              .join("")}
          </div>
        </div>
      </div>`
          : ""
      }

      <div id="findings-toolbar" class="sticky top-16 z-40 bg-slate-50/95 backdrop-blur-md py-5 border-b border-slate-200/80 mb-8 flex flex-col gap-5">
        <!-- Row 1: Title, View Toggle & Expand All -->
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-4">
            <h3 class="text-xl font-extrabold text-slate-900 tracking-tight">Findings <span class="text-slate-600 font-bold ml-1">${findings.length}</span></h3>
            <div class="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              <button onclick="setView('severity')" id="view-severity" class="view-btn px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest bg-[var(--primary-light)] text-[var(--primary)] transition-all">By Severity</button>
              ${
                Object.keys(_pageCounts).length > 1
                  ? `<button onclick="setView('page')" id="view-page" class="view-btn px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-all">By Page</button>`
                  : ""
              }
            </div>
          </div>
          <button onclick="toggleAllCards()" id="expand-all-btn" class="px-5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 hover:border-slate-300 hover:text-slate-800 shadow-sm transition-all">Expand all</button>
        </div>

        <!-- Row 2: Search & Filter Select -->
        <div class="flex items-center gap-4 w-full">
          <div class="relative flex-1">
            <input type="text" id="search-input" oninput="handleSearch(this.value)" placeholder="Search violations..." class="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 focus:border-[var(--primary)] transition-all shadow-sm">
            <svg class="absolute left-4 top-3.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          
          <div id="filter-controls" class="flex items-center gap-2 shrink-0">
            <label for="filter-select" class="text-xs font-bold text-slate-600 uppercase tracking-widest hidden sm:block whitespace-nowrap">Filter by:</label>
            <select id="filter-select" onchange="filterIssues(this.value)" class="${selectClasses}">
              <optgroup label="General">
                <option value="all">All Issues</option>
              </optgroup>
              <optgroup label="Severity">
                <option value="Critical">Critical</option>
                <option value="Serious">Serious</option>
                <option value="Moderate">Moderate</option>
                <option value="Minor">Minor</option>
              </optgroup>
              <optgroup label="WCAG Principle">
                <option value="Perceivable">Perceivable</option>
                <option value="Operable">Operable</option>
                <option value="Understandable">Understandable</option>
                <option value="Robust">Robust</option>
              </optgroup>
            </select>
          </div>
          ${pageSelectHtml}
        </div>
      </div>

      <div id="issues-container" class="space-y-6">
        ${findings.length === 0 ? "No issues found." : findings.map((f) => buildIssueCard(f)).join("\n")}
      </div>

      <div id="page-container" style="display:none">
        ${buildPageGroupedSection(findings)}
      </div>

      <footer class="mt-10 py-6 border-t border-slate-200 text-center">
        <p class="text-slate-600 text-sm font-medium">Generated by <a href="https://github.com/diegovelasquezweb/a11y" target="_blank" class="text-slate-700 hover:text-[var(--primary)] font-semibold transition-colors">a11y</a> &bull; <span class="text-slate-700">${escapeHtml(args.target)}</span></p>
      </footer>
    </main>

  <script>
    function setView(view) {
      const severityContainer = document.getElementById('issues-container');
      const pageContainer = document.getElementById('page-container');
      const filterControls = document.getElementById('filter-controls');
      const pageSelectCont = document.getElementById('page-select-container');
      const btnSeverity = document.getElementById('view-severity');
      const btnPage = document.getElementById('view-page');

      if (view === 'severity') {
        severityContainer.style.display = '';
        pageContainer.style.display = 'none';
        if (filterControls) filterControls.style.display = 'flex';
        if (pageSelectCont) pageSelectCont.style.display = 'none';
        
        if (btnSeverity) {
          btnSeverity.classList.add('bg-[var(--primary-light)]', 'text-[var(--primary)]');
          btnSeverity.classList.remove('text-slate-500', 'hover:text-slate-700');
        }
        if (btnPage) {
          btnPage.classList.remove('bg-[var(--primary-light)]', 'text-[var(--primary)]');
          btnPage.classList.add('text-slate-500', 'hover:text-slate-700');
        }
      } else {
        severityContainer.style.display = 'none';
        pageContainer.style.display = '';
        if (filterControls) filterControls.style.display = 'flex';
        if (pageSelectCont) {
          pageSelectCont.style.display = 'flex';
          const ps = document.getElementById('page-select');
          if (ps) { ps.value = 'all'; filterByPage('all'); }
        }
        
        if (btnPage) {
          btnPage.classList.add('bg-[var(--primary-light)]', 'text-[var(--primary)]');
          btnPage.classList.remove('text-slate-500', 'hover:text-slate-700');
        }
        if (btnSeverity) {
          btnSeverity.classList.remove('bg-[var(--primary-light)]', 'text-[var(--primary)]');
          btnSeverity.classList.add('text-slate-500', 'hover:text-slate-700');
        }
      }
      _syncExpandBtn();
    }

    function _activeCards() {
      const sev = document.getElementById('issues-container');
      const pg = document.getElementById('page-container');
      const container = sev && sev.style.display !== 'none' ? sev : pg;
      return container ? [...container.querySelectorAll('.issue-card')] : [];
    }

    function _syncExpandBtn() {
      const btn = document.getElementById('expand-all-btn');
      if (!btn) return;
      const anyCollapsed = _activeCards().some(c => c.dataset.collapsed === 'true');
      btn.textContent = anyCollapsed ? 'Expand all' : 'Collapse all';
    }

    function switchIssueTab(button, tabKey) {
      const root = button.closest('[data-issue-tab-root]');
      if (!root) return;
      const card = button.closest('.issue-card');
      if (!card) return;

      const tabs = [...root.querySelectorAll('[role="tab"]')];
      const panels = [...card.querySelectorAll('[role="tabpanel"][data-tab-panel]')];

      tabs.forEach((tab) => {
        const isActive = tab === button;
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
        if (isActive) {
          tab.classList.add('bg-white', 'text-indigo-700', 'border', 'border-indigo-200', 'shadow-sm');
          tab.classList.remove('text-slate-600', 'border-transparent', 'hover:bg-white/70');
        } else {
          tab.classList.remove('bg-white', 'text-indigo-700', 'border', 'border-indigo-200', 'shadow-sm');
          tab.classList.add('text-slate-600', 'border-transparent', 'hover:bg-white/70');
        }
      });

      panels.forEach((panel) => {
        const isTarget = panel.dataset.tabPanel === tabKey;
        panel.classList.toggle('hidden', !isTarget);
      });
    }

    function handleIssueTabKeydown(event, button) {
      const root = button.closest('[data-issue-tab-root]');
      if (!root) return;
      const tabs = [...root.querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(button);
      if (index === -1) return;

      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const key = button.getAttribute('aria-controls')?.split('-').pop();
        if (key) switchIssueTab(button, key);
        return;
      } else {
        return;
      }

      event.preventDefault();
      tabs[nextIndex].focus();
      const key = tabs[nextIndex].getAttribute('aria-controls')?.split('-').pop();
      if (key) switchIssueTab(tabs[nextIndex], key);
    }



    function toggleCard(header) {
      const card = header.closest('.issue-card, .manual-card');
      const body = card.querySelector('.card-body');
      const chevron = header.querySelector('.card-chevron');
      const isCollapsed = card.dataset.collapsed === 'true';
      if (isCollapsed) {
        body.style.gridTemplateRows = '1fr';
        card.dataset.collapsed = 'false';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      } else {
        body.style.gridTemplateRows = '0fr';
        card.dataset.collapsed = 'true';
        if (chevron) chevron.style.transform = '';
      }
      header.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
      _syncExpandBtn();
    }

    function toggleAllCards() {
      const cards = _activeCards();
      const anyCollapsed = cards.some(c => c.dataset.collapsed === 'true');
      cards.forEach(card => {
        const body = card.querySelector('.card-body');
        const chevron = card.querySelector('.card-chevron');
        if (anyCollapsed) {
          body.style.gridTemplateRows = '1fr';
          card.dataset.collapsed = 'false';
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
          body.style.gridTemplateRows = '0fr';
          card.dataset.collapsed = 'true';
          if (chevron) chevron.style.transform = '';
        }
      });
      const btn = document.getElementById('expand-all-btn');
      if (btn) btn.textContent = anyCollapsed ? 'Collapse all' : 'Expand all';
    }

    function filterByPage(page) {
      document.querySelectorAll('.page-group').forEach(group => {
        group.style.display = (page === 'all' || group.dataset.page === page) ? '' : 'none';
      });
    }

    function filterIssues(type) {
        const cards = document.querySelectorAll('.issue-card');
        const q = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
        let visibleCount = 0;
        const principles = ['Perceivable', 'Operable', 'Understandable', 'Robust'];
        let emptyMsg = document.getElementById('dynamic-empty-state');
        const container = document.getElementById('issues-container');

        cards.forEach(card => {
            const severity = card.dataset.severity;
            let match = false;
            if (type === 'all') match = true;
            else if (severity === type) match = true;
            if (principles.includes(type)) {
                const badge = card.querySelector('.wcag-label');
                const wcagText = badge ? badge.textContent : '';
                if (type === 'Perceivable' && wcagText.includes(' 1.')) match = true;
                if (type === 'Operable' && wcagText.includes(' 2.')) match = true;
                if (type === 'Understandable' && wcagText.includes(' 3.')) match = true;
                if (type === 'Robust' && wcagText.includes(' 4.')) match = true;
            }
            const searchableText = [...card.querySelectorAll('.searchable-field')]
              .map(el => el.textContent).join(' ').concat(' ', card.id).toLowerCase();
            const textMatch = !q || searchableText.includes(q);
            if (match && textMatch) { card.style.display = ''; visibleCount++; }
            else { card.style.display = 'none'; }
        });

        if (visibleCount === 0) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('div');
                emptyMsg.id = 'dynamic-empty-state';
                emptyMsg.className = 'text-center py-12 bg-slate-50 rounded-xl border border-slate-100 border-dashed';
                emptyMsg.innerHTML = '<div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-4 text-slate-400"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div><h3 class="text-sm font-bold text-slate-900">No matching issues</h3><p class="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">No violations found for this filter</p>';
                container.appendChild(emptyMsg);
            }
            emptyMsg.style.display = 'block';
        } else {
            if (emptyMsg) emptyMsg.style.display = 'none';
        }
    }

    window.addEventListener('scroll', () => {
        const nav = document.getElementById('navbar');
        if (window.scrollY > 20) {
            nav.classList.add('shadow-md');
        } else {
            nav.classList.remove('shadow-md');
        }
    });

    function scrollToIssue(id) {
        const el = document.getElementById(id);
        if (!el) return;

        setView('severity');
        filterIssues('all');

        const body = el.querySelector('.card-body');
        const chevron = el.querySelector('.card-chevron');
        if (el.dataset.collapsed === 'true') {
            body.style.gridTemplateRows = '1fr';
            el.dataset.collapsed = 'false';
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        }

        const navHeight = 64 + (document.getElementById('findings-toolbar')?.offsetHeight || 0);
        window.scrollTo({
            top: el.offsetTop - navHeight - 20,
            behavior: 'smooth'
        });

        el.classList.add('ring-4', 'ring-[var(--primary)]/30', 'border-[var(--primary)]');
        setTimeout(() => {
            el.classList.remove('ring-4', 'ring-[var(--primary)]/30', 'border-[var(--primary)]');
        }, 2000);
    }

    function handleSearch(query) {
        const filterType = document.getElementById('filter-select')?.value || 'all';
        filterIssues(filterType);
    }

    async function copyToClipboard(text, btn) {
        const original = btn.innerHTML;
        try {
            await navigator.clipboard.writeText(text);
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
            btn.classList.add('bg-emerald-500');
            setTimeout(() => {
                btn.innerHTML = original;
                btn.classList.remove('bg-emerald-500');
            }, 2000);
        } catch {
            btn.textContent = 'Failed';
            btn.classList.add('bg-red-500');
            setTimeout(() => {
                btn.innerHTML = original;
                btn.classList.remove('bg-red-500');
            }, 2000);
        }
    }
  </script>
</body>
</html>`;
}

/**
 * The main execution function for the HTML report builder.
 * Coordinates data reading, normalization, HTML generation, and file writing.
 * @throws {Error} If required arguments are missing or input data is invalid.
 */
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) {
    throw new Error("Missing required --output flag for HTML report location.");
  }
  const inputPayload = readJson(args.input);
  if (!inputPayload) {
    throw new Error(`Input findings file not found or invalid: ${args.input}`);
  }

  const findings = normalizeFindings(inputPayload).filter(
    (f) => f.wcagClassification !== "AAA" && f.wcagClassification !== "Best Practice",
  );

  const screenshotsDir = getInternalPath("screenshots");
  for (const finding of findings) {
    if (finding.screenshotPath) {
      const filename = path.basename(finding.screenshotPath);
      const absolutePath = path.join(screenshotsDir, filename);
      if (fs.existsSync(absolutePath)) {
        const data = fs.readFileSync(absolutePath);
        finding.screenshotPath = `data:image/png;base64,${data.toString("base64")}`;
      } else {
        finding.screenshotPath = null;
      }
    }
  }

  const html = buildHtml(args, findings, inputPayload.metadata);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, html, "utf-8");

  if (findings.length === 0) {
    log.info("Congratulations, no issues found.");
  }
  log.success(`HTML report written to ${args.output}`);
}

try {
  main();
} catch (error) {
  log.error(`HTML Generation Error: ${error.message}`);
  process.exit(1);
}
