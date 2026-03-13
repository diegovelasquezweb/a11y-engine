/**
 * @file format-html.mjs
 * @description HTML report component builders and formatting logic.
 * Responsible for generating individual UI components like issue cards, manual check sections,
 * and technical evidence blocks for the final HTML report.
 */

import { ASSET_PATHS, loadAssetJson } from "../../core/asset-loader.mjs";
import { SEVERITY_ORDER } from "./findings.mjs";
import { escapeHtml, formatMultiline, linkify } from "./utils.mjs";

const MANUAL_CHECKS = loadAssetJson(
  ASSET_PATHS.reporting.manualChecks,
  "assets/reporting/manual-checks.json",
);

/**
 * Renders technical evidence (HTML snippets and failure summaries) for the dashboard.
 * @param {Object[]} evidence - List of evidence objects containing HTML and failure summaries.
 * @returns {string} The formatted HTML string for the evidence block.
 */
function formatEvidence(evidence) {
  const data = Array.isArray(evidence) ? evidence : [];
  if (data.length === 0) return "";

  return data
    .map((item) => {
      const failureSummary = item.failureSummary
        ? `<div class="mt-2 p-3 bg-rose-50 border-l-4 border-rose-500 text-rose-700 text-xs font-mono whitespace-pre-wrap">${formatMultiline(item.failureSummary)}</div>`
        : "";
      const htmlSnippet = item.html
        ? `<div class="mb-2"><span class="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">Source</span><pre tabindex="0" class="bg-slate-900 text-slate-50 p-3 rounded-lg overflow-x-auto text-xs font-mono border border-slate-700"><code>${escapeHtml(item.html)}</code></pre></div>`
        : "";
      return `
      <div class="mb-4 last:mb-0">
        ${htmlSnippet}
        ${failureSummary}
      </div>`;
    })
    .join("");
}

/**
 * Builds an interactive HTML card for an automated accessibility violation finding.
 * @param {Object} finding - The normalized finding object to render.
 * @returns {string} The complete HTML string for the issue card.
 */
export function buildIssueCard(finding) {
  const cardId = escapeHtml(finding.id);
  let severityBadge = "";
  let borderClass = "";

  switch (finding.severity) {
    case "Critical":
      severityBadge = "bg-rose-100 text-rose-800 border-rose-200";
      borderClass = "border-rose-200 hover:border-rose-300";
      break;
    case "Serious":
      severityBadge = "bg-orange-100 text-orange-800 border-orange-200";
      borderClass = "border-orange-200 hover:border-orange-300";
      break;
    case "Moderate":
      severityBadge = "bg-amber-100 text-amber-800 border-amber-200";
      borderClass = "border-amber-200 hover:border-amber-300";
      break;
    case "Minor":
      severityBadge = "bg-emerald-100 text-emerald-700 border-emerald-200";
      borderClass = "border-emerald-200 hover:border-emerald-300";
      break;
    default:
      severityBadge = "bg-slate-100 text-slate-800 border-slate-200";
      borderClass = "border-slate-200";
  }

  let effortBadge = "";
  const effortLevel = finding.effort ?? (finding.fixCode ? "low" : "high");
  if (effortLevel === "low") {
    effortBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 uppercase tracking-widest shadow-sm">Low Effort</span>`;
  } else if (effortLevel === "medium") {
    effortBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60 uppercase tracking-widest shadow-sm">Med Effort</span>`;
  } else {
    effortBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60 uppercase tracking-widest shadow-sm">High Effort</span>`;
  }

  const stackNotes = [
    ...(finding.frameworkNotes && typeof finding.frameworkNotes === "object"
      ? Object.entries(finding.frameworkNotes).map(([fw, note]) => ({ key: fw, note, style: "bg-slate-100 text-slate-600 border-slate-200" }))
      : []),
    ...(finding.cmsNotes && typeof finding.cmsNotes === "object"
      ? Object.entries(finding.cmsNotes).map(([cms, note]) => ({ key: cms, note, style: "bg-violet-50 text-violet-700 border-violet-200" }))
      : []),
  ];

  const stackNotesHtml = stackNotes.length > 0
    ? `<div class="mt-4 pt-3 border-t border-indigo-100/50">
        <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
          Stack Notes
        </h4>
        <div class="space-y-2">
          ${stackNotes.map(({ key, note, style }) => `
          <div class="flex gap-2 items-start">
            <span class="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${style} uppercase tracking-wider mt-0.5">${escapeHtml(key)}</span>
            <p class="text-[12px] text-slate-600 leading-relaxed">${escapeHtml(note)}</p>
          </div>`).join("")}
        </div>
      </div>`
    : "";

  const implNotesHtml = finding.fixDifficultyNotes
    ? `<div class="mt-4 pt-3 border-t border-indigo-100/50">
        <h4 class="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          Implementation Notes
        </h4>
        <p class="text-[12px] text-amber-900/80 leading-relaxed bg-amber-50/60 border border-amber-100/60 rounded-lg p-3">${escapeHtml(finding.fixDifficultyNotes)}</p>
      </div>`
    : "";

  const problemPanelHtml = `
    <div class="grid grid-cols-1 gap-6">
      <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5 space-y-5">
        <h4 class="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <div class="p-1 bg-slate-100 rounded-md">
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          The Problem
        </h4>
        <div>
          <span class="text-[10px] font-bold text-rose-600 uppercase tracking-wider block mb-1">Actual Behavior</span>
          <p class="text-[13px] text-slate-700 leading-relaxed border-l-2 border-rose-300 pl-3">${formatMultiline(finding.actual)}</p>
        </div>
        ${finding.expected ? `
        <div>
          <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Expected Behavior</span>
          <p class="text-[13px] text-slate-700 leading-relaxed border-l-2 border-emerald-300 pl-3">${formatMultiline(finding.expected)}</p>
        </div>` : ""}
        <div>
          <span class="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Impacted Users</span>
          <p class="text-[13px] text-slate-600 leading-relaxed italic border-l-2 border-slate-200 pl-3">${formatMultiline(finding.impactedUsers)}</p>
        </div>
      </div>
    </div>`;

  const fixPanelHtml = `
    <div class="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100/80 rounded-xl p-5 relative overflow-hidden shadow-sm">
      <div class="absolute top-0 right-0 p-4 opacity-[0.03] transform translate-x-4 -translate-y-4 pointer-events-none">
        <svg class="w-32 h-32 text-indigo-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"></path></svg>
      </div>
      <h4 class="text-[11px] font-black text-indigo-700 uppercase tracking-widest mb-4 relative z-10 flex items-center gap-2">
        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        The Fix
      </h4>
      <div class="relative z-10 space-y-4">
        ${finding.fixDescription ? `<p class="text-sm text-indigo-800 leading-relaxed">${escapeHtml(finding.fixDescription)}</p>` : ""}
        ${finding.fixCode ? `
        <div class="relative group/code">
          <pre tabindex="0" class="bg-slate-900 text-emerald-300 p-3 rounded-lg overflow-x-auto text-xs font-mono border border-slate-700 whitespace-pre-wrap">${escapeHtml(finding.fixCode)}</pre>
          <button aria-label="Copy code snippet" title="Copy code snippet" onclick="copyToClipboard(\`${escapeHtml(finding.fixCode).replace(/`/g, "\\`")}\`, this)" class="absolute top-2 right-2 p-1.5 rounded-lg bg-indigo-500/50 text-white opacity-0 group-hover/code:opacity-100 transition-all hover:bg-indigo-500">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          </button>
        </div>` : ""}
        ${finding.mdn ? `
        <div class="pt-1">
          <a href="${escapeHtml(finding.mdn)}" target="_blank" class="text-[11px] font-bold text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5 uppercase tracking-wider">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.246 18.477 16.5 18c-1.746 0-3.332.477-4.5 1.253" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            MDN Docs
          </a>
        </div>` : ""}
        ${implNotesHtml}
        ${stackNotesHtml}
      </div>
    </div>`;

  const technicalEvidencePanelHtml = finding.evidence && finding.evidence.length > 0
    ? `<div class="bg-slate-900 rounded-xl p-6 border border-slate-700 shadow-2xl relative overflow-hidden">
        <div class="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <h4 class="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-4 relative z-10 flex items-center gap-2">
            <div class="p-1 bg-slate-800 rounded-md border border-slate-700">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
            </div>
            Technical Evidence
        </h4>
        <div class="relative z-10">
            ${formatEvidence(finding.evidence)}
        </div>
      </div>`
    : "";

  const visualEvidencePanelHtml = finding.screenshotPath
    ? `<div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
        <h4 class="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
          <div class="p-1 bg-slate-100 rounded-md">
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          Visual Evidence
        </h4>
        <div class="bg-slate-50/50 p-2 rounded-xl border border-slate-200/60 inline-block shadow-sm">
          <img src="${escapeHtml(finding.screenshotPath)}" alt="Screenshot of ${escapeHtml(finding.title)}" class="rounded-lg border border-slate-200 shadow-sm max-h-[360px] w-auto object-contain bg-white" loading="lazy">
        </div>
      </div>`
    : "";

  const normalizeBadgeText = (value, { keepAcronyms = false } = {}) =>
    String(value || "")
      .split(/[-_]/g)
      .map((part) => {
        if (!part) return "";
        if (keepAcronyms && part.toLowerCase() === "aria") return "ARIA";
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");

  const ruleLabel = normalizeBadgeText(finding.ruleId);
  const categoryLabel = finding.category
    ? normalizeBadgeText(finding.category, { keepAcronyms: true })
    : "";

  const tabs = [
    { key: "problem", label: "The Problem", content: problemPanelHtml },
    { key: "fix", label: "The Fix", content: fixPanelHtml },
  ];
  if (technicalEvidencePanelHtml) {
    tabs.push({ key: "technical", label: "Technical Evidence", content: technicalEvidencePanelHtml });
  }
  if (visualEvidencePanelHtml) {
    tabs.push({ key: "visual", label: "Visual Evidence", content: visualEvidencePanelHtml });
  }

  const tabsMarkup = tabs.map((tab, index) => {
    const active = index === 0;
    return `<button
      id="tab-${cardId}-${tab.key}"
      role="tab"
      type="button"
      aria-selected="${active ? "true" : "false"}"
      aria-controls="panel-${cardId}-${tab.key}"
      tabindex="${active ? "0" : "-1"}"
      onclick="switchIssueTab(this, '${tab.key}')"
      onkeydown="handleIssueTabKeydown(event, this)"
      class="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${active ? "bg-white text-indigo-700 border border-indigo-200 shadow-sm" : "text-slate-600 border border-transparent hover:bg-white/70"}"
    >${tab.label}<span class="sr-only"> for ${cardId}</span></button>`;
  }).join("");

  const panelsMarkup = tabs.map((tab, index) => {
    const active = index === 0;
    return `<section
      id="panel-${cardId}-${tab.key}"
      role="tabpanel"
      aria-labelledby="tab-${cardId}-${tab.key}"
      data-tab-panel="${tab.key}"
      class="${active ? "" : "hidden"}"
      tabindex="0"
    >
      ${tab.content}
    </section>`;
  }).join("");

  return `
<article class="issue-card bg-white/90 backdrop-blur-xl rounded-2xl border ${borderClass} shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 mb-8 overflow-hidden group" data-severity="${finding.severity}" data-rule-id="${escapeHtml(finding.ruleId)}" data-wcag="${escapeHtml(finding.wcag)}" data-collapsed="true" id="${escapeHtml(finding.id)}">
  <button
    class="card-header w-full text-left p-5 md:p-6 bg-gradient-to-r from-white to-slate-50/80 cursor-pointer select-none relative focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
    onclick="toggleCard(this)"
    aria-expanded="false"
    aria-controls="body-${escapeHtml(finding.id)}"
  >
    <div class="absolute inset-y-0 left-0 w-1.5 ${severityBadge.split(" ")[0]} opacity-80"></div>
    <div class="flex items-start gap-4 pl-2">
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2.5 mb-3.5">
          <span class="px-3 py-1 rounded-full text-[11px] font-bold border ${severityBadge} shadow-sm backdrop-blur-sm uppercase tracking-wider">${escapeHtml(finding.severity)}</span>
          ${effortBadge}
          <span class="wcag-label px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-50/80 text-indigo-700 border border-indigo-100/80 shadow-sm backdrop-blur-sm">WCAG ${escapeHtml(finding.wcag)}</span>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(ruleLabel)}</span>
          ${categoryLabel ? `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200">${escapeHtml(categoryLabel)}</span>` : ""}
        </div>
        <h3 class="text-lg md:text-xl font-extrabold text-slate-900 leading-tight mb-3 group-hover:text-indigo-900 transition-colors searchable-field issue-title">${escapeHtml(finding.title)}</h3>
        <div class="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-slate-600 font-medium">
          <div class="flex items-center gap-1.5 bg-slate-50/50 px-2 py-1 rounded-md border border-slate-100">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            <span class="truncate max-w-[200px] md:max-w-md transition-colors searchable-field issue-url">${escapeHtml(finding.url)}</span>
          </div>
          <div class="flex items-center gap-1.5 min-w-0 bg-slate-50/50 px-2 py-1 rounded-md border border-slate-100">
            <svg class="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
            <code class="text-[12px] text-slate-800 font-mono truncate min-w-0 flex-1 searchable-field issue-selector">${escapeHtml(finding.selector)}</code>
          </div>
        </div>
      </div>
      <div class="bg-white p-1.5 rounded-full border border-slate-200 shadow-sm group-hover:bg-slate-50 transition-colors mt-1 flex-shrink-0">
        <svg class="card-chevron w-5 h-5 text-slate-500 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
  </button>

  <div class="card-body grid transition-all duration-300 ease-in-out" style="grid-template-rows: 0fr;" id="body-${escapeHtml(finding.id)}">
  <div class="overflow-hidden">
  <div class="p-6 md:p-8 bg-slate-50/30 border-t border-slate-100/60">
    <div class="rounded-xl border border-slate-200 bg-slate-100/70 p-2 mb-4" data-issue-tab-root>
      <div role="tablist" aria-label="Issue detail sections for ${escapeHtml(finding.id)}" class="flex flex-wrap gap-2">
        ${tabsMarkup}
      </div>
    </div>

    <div class="space-y-4" id="issue-tabs-${cardId}">
      ${panelsMarkup}
    </div>
  </div>
  </div>
  </div>
</article>`;
}

/**
 * Builds an interactive accordion card for a manual accessibility check.
 * @param {Object} check - The manual check definition object.
 * @returns {string} The complete HTML string for the manual check card.
 */
export function buildManualCheckCard(check) {
  const id = `manual-${check.criterion.replace(/\./g, "-")}`;
  const steps = check.steps
    .map((s, i) => `<li class="text-[13px] text-slate-600 leading-relaxed"><span class="font-bold text-slate-400 mr-1.5">${i + 1}.</span>${escapeHtml(s)}</li>`)
    .join("");

  const criterionPill = check.level !== "AT"
    ? `<span class="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(check.criterion)}</span>`
    : "";

  const levelPill = check.level === "AT"
    ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200">Assistive Technology</span>`
    : `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">WCAG ${escapeHtml(check.level)}</span>`;

  const conditionalNote = check.conditional
    ? `<div class="mb-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <svg class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <p class="text-[12px] text-amber-800 font-medium leading-relaxed">${escapeHtml(check.conditional)}</p>
      </div>`
    : "";

  const codeExampleHtml = check.code_example
    ? `<div class="border-t border-slate-100 mt-2 pt-6">
        <h4 class="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-4">Before / After</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span class="text-[10px] font-bold text-rose-600 uppercase tracking-widest block mb-1.5">Before</span>
            <pre tabindex="0" class="bg-slate-900 text-slate-50 p-3 rounded-lg overflow-x-auto text-xs font-mono border border-slate-700"><code>${escapeHtml(check.code_example.before)}</code></pre>
          </div>
          <div>
            <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block mb-1.5">After</span>
            <pre tabindex="0" class="bg-slate-900 text-slate-50 p-3 rounded-lg overflow-x-auto text-xs font-mono border border-slate-700"><code>${escapeHtml(check.code_example.after)}</code></pre>
          </div>
        </div>
      </div>`
    : "";

  return `
<article class="manual-card bg-white/90 backdrop-blur-xl rounded-2xl border border-amber-200 hover:border-amber-300 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 mb-4 overflow-hidden group" id="${id}" data-criterion="${escapeHtml(check.criterion)}" data-level="${escapeHtml(check.level)}" data-state="" data-collapsed="true">
  <div class="manual-header flex items-stretch bg-gradient-to-r from-amber-50/60 to-white">
    <button
      class="card-header flex-1 text-left p-5 md:p-6 cursor-pointer select-none relative focus:outline-none focus:ring-4 focus:ring-amber-500/20"
      onclick="toggleCard(this)"
      aria-expanded="false"
      aria-controls="${id}-body"
    >
      <div class="flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-2.5">
            <span class="manual-badge px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">Manual</span>
            ${criterionPill}
            ${levelPill}
          </div>
          <h3 class="text-base font-extrabold text-slate-900 group-hover:text-amber-900 transition-colors">${escapeHtml(check.title)}</h3>
        </div>
        <div class="bg-white p-1.5 rounded-full border border-amber-200 shadow-sm group-hover:bg-amber-50 transition-colors flex-shrink-0">
          <svg class="card-chevron w-5 h-5 text-amber-500 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
    </button>
    <div class="flex items-center gap-2 px-4 border-l border-amber-100 flex-shrink-0">
      <button class="manual-verified-btn px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors whitespace-nowrap" onclick="setManualState('${escapeHtml(check.criterion)}', 'verified')">✓ Verified</button>
      <button class="manual-na-btn px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap" onclick="setManualState('${escapeHtml(check.criterion)}', 'na')">N/A</button>
    </div>
  </div>

  <div class="card-body grid transition-all duration-300 ease-in-out" style="grid-template-rows: 0fr;" id="${id}-body">
  <div class="overflow-hidden">
  <div class="p-6 md:p-8 bg-slate-50/30 border-t border-amber-100/60">

    ${conditionalNote}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h4 class="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-3">What to verify</h4>
        <p class="text-[13px] text-slate-600 leading-relaxed">${escapeHtml(check.description)}</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h4 class="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-3">How to test</h4>
        <ol class="space-y-2 list-none">
          ${steps}
        </ol>
      </div>
    </div>

    ${codeExampleHtml}

    <div class="mt-4 pt-4 border-t border-slate-100">
      <a href="${escapeHtml(check.ref)}" target="_blank" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors flex items-center gap-1.5 uppercase tracking-wider">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        ${check.level === "AT" ? `W3C Reference — ${escapeHtml(check.title)}` : `WCAG 2.2 — ${escapeHtml(check.criterion)} ${escapeHtml(check.title)}`}
      </a>
    </div>

  </div>
  </div>
  </div>
</article>`;
}

/**
 * Groups findings by page area (URL or path) and renders sorted issue cards for each group.
 * @param {Object[]} findings - The normalized list of findings to group and render.
 * @returns {string} The complete HTML string for the grouped sections.
 */
export function buildPageGroupedSection(findings) {
  if (findings.length === 0) return "";

  const pageGroups = {};
  for (const f of findings) {
    if (!pageGroups[f.area]) pageGroups[f.area] = [];
    pageGroups[f.area].push(f);
  }

  const sorted = Object.entries(pageGroups).sort(
    (a, b) => b[1].length - a[1].length,
  );

  return sorted
    .map(([page, pageFinding]) => {
      const cards = pageFinding
        .sort(
          (a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 99) -
            (SEVERITY_ORDER[b.severity] ?? 99),
        )
        .map((f) => buildIssueCard(f))
        .join("\n");

      return `<div class="page-group mb-10" data-page="${escapeHtml(page)}">
      ${cards}
    </div>`;
    })
    .join("");
}
