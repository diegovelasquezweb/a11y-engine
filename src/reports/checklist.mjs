/**
 * @file report-checklist.mjs
 * @description Generates a standalone manual accessibility testing checklist.
 * Does not depend on scan results — reads directly from assets/reporting/manual-checks.json.
 */

import fs from "node:fs";
import path from "node:path";
import { log, getInternalPath } from "../../core/utils.mjs";
import { ASSET_PATHS, loadAssetJson } from "../../core/asset-loader.mjs";
import { buildManualCheckCard } from "../renderers/html.mjs";
import { escapeHtml } from "../renderers/utils.mjs";

const MANUAL_CHECKS = loadAssetJson(
  ASSET_PATHS.reporting.manualChecks,
  "assets/reporting/manual-checks.json",
);

const TOTAL = MANUAL_CHECKS.length;
const COUNT_A = MANUAL_CHECKS.filter((c) => c.level === "A").length;
const COUNT_AA = MANUAL_CHECKS.filter((c) => c.level === "AA").length;
const COUNT_AT = MANUAL_CHECKS.filter((c) => c.level === "AT").length;

function parseArgs(argv) {
  const args = { output: "", baseUrl: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--output") args.output = argv[i + 1] ?? "";
    if (argv[i] === "--base-url") args.baseUrl = argv[i + 1] ?? "";
  }
  return args;
}

function buildHtml(args) {
  const cards = MANUAL_CHECKS.map((c) => buildManualCheckCard(c)).join("\n");
  const siteLabel = args.baseUrl || "your site";

  const selectClasses =
    "pl-4 pr-10 py-3 bg-white border border-slate-300 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-amber-500/20 focus:border-amber-400 shadow-sm transition-all appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23374151%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%3E%3Cpath%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Manual Accessibility Checklist &mdash; ${escapeHtml(siteLabel)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --amber: hsl(38, 92%, 50%);
      --slate-50: #f8fafc; --slate-100: #f1f5f9; --slate-200: #e2e8f0;
      --slate-300: #cbd5e1; --slate-400: #94a3b8; --slate-500: #64748b;
      --slate-600: #475569; --slate-700: #334155; --slate-800: #1e293b;
      --slate-900: #0f172a;
    }
    html { scroll-padding-top: 80px; }
    body { background-color: var(--slate-50); font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; letter-spacing: -0.011em; }
    .glass-header { background: rgba(255,255,255,0.85); backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%); }
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

    <!-- Why section -->
    <div class="mb-12">
      <h2 class="text-3xl font-extrabold mb-3">Why manual testing?</h2>
      <p class="text-slate-500 text-base leading-relaxed mb-8 max-w-2xl">For people who rely on screen readers or keyboard navigation, an inaccessible website is a locked door. Automated scanners catch roughly 40% of WCAG violations. This checklist covers the rest.</p>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div class="bg-white rounded-2xl border border-indigo-100 p-5 shadow-sm">
          <div class="text-3xl font-black text-slate-900 mb-1">${COUNT_A}</div>
          <div class="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">WCAG A</div>
          <p class="text-xs text-slate-500 leading-relaxed">Baseline conformance. Verifiable with a browser and keyboard only.</p>
        </div>
        <div class="bg-white rounded-2xl border border-amber-100 p-5 shadow-sm">
          <div class="text-3xl font-black text-slate-900 mb-1">${COUNT_AA}</div>
          <div class="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2">WCAG AA</div>
          <p class="text-xs text-slate-500 leading-relaxed">Legal compliance target in most jurisdictions. Requires DevTools for some checks.</p>
        </div>
        <div class="bg-white rounded-2xl border border-violet-100 p-5 shadow-sm">
          <div class="text-3xl font-black text-slate-900 mb-1">${COUNT_AT}</div>
          <div class="text-xs font-bold text-violet-600 uppercase tracking-widest mb-2">Assistive Technology</div>
          <p class="text-xs text-slate-500 leading-relaxed">Requires VoiceOver (macOS) or NVDA (Windows) to verify real screen reader behavior.</p>
        </div>
      </div>

      <div class="bg-slate-900 rounded-2xl p-6 text-sm text-slate-300 leading-relaxed">
        <p class="font-bold text-white mb-4">What you need for this session</p>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 list-none">
          <li class="flex items-start gap-2"><span class="text-amber-400 font-bold mt-0.5">→</span> A browser with DevTools open</li>
          <li class="flex items-start gap-2"><span class="text-amber-400 font-bold mt-0.5">→</span> <strong class="text-slate-100">${escapeHtml(siteLabel)}</strong> open in another tab</li>
          <li class="flex items-start gap-2"><span class="text-amber-400 font-bold mt-0.5">→</span> Keyboard only for navigation checks</li>
          <li class="flex items-start gap-2"><span class="text-amber-400 font-bold mt-0.5">→</span> VoiceOver / NVDA for <span class="text-violet-400 font-semibold">AT checks</span></li>
        </ul>
      </div>
    </div>

    <!-- Toolbar -->
    <div id="checklist-toolbar" class="sticky top-16 z-40 bg-slate-50/95 backdrop-blur-md py-4 border-b border-slate-200/80 mb-8 space-y-4">

      <div id="manual-progress-sticky" class="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm">
        <div class="flex-1">
          <div class="flex justify-between text-xs font-medium text-slate-500 mb-1.5">
            <span>Verification progress</span>
            <span id="manual-progress-label">0 / ${TOTAL} verified</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2">
            <div id="manual-progress-bar" class="bg-emerald-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <input type="text" id="search-input" oninput="filterChecks()" placeholder="Search checks…" class="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm">
          <svg class="absolute left-4 top-3.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <label for="level-select" class="sr-only">Filter checklist by level</label>
        <select id="level-select" onchange="filterChecks()" class="${selectClasses}">
          <option value="all">All levels (${TOTAL})</option>
          <option value="A">WCAG A (${COUNT_A})</option>
          <option value="AA">WCAG AA (${COUNT_AA})</option>
          <option value="AT">Assistive Tech (${COUNT_AT})</option>
        </select>
        <button onclick="toggleAllCards()" id="expand-all-btn" class="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 hover:border-slate-300 hover:text-slate-800 shadow-sm transition-all whitespace-nowrap">Expand all</button>
      </div>

    </div>

    <!-- Cards -->
    <div id="checklist-container" class="space-y-4">
      ${cards}
    </div>

    <div id="empty-state" class="hidden text-center py-16 text-slate-400">
      <p class="text-sm font-bold">No checks match your filter.</p>
    </div>

    <footer class="mt-12 py-6 border-t border-slate-200 text-center">
      <p class="text-slate-600 text-sm font-medium">Generated by <a href="https://github.com/diegovelasquezweb/a11y" target="_blank" class="text-slate-700 hover:text-amber-700 font-semibold transition-colors">a11y</a> &bull; <span class="text-slate-700">WCAG 2.2 AA</span></p>
    </footer>

  </main>

  <script>
    const TOTAL_CHECKS = ${TOTAL};

    function updateProgress() {
      let verified = 0, na = 0;
      document.querySelectorAll('.manual-card').forEach(c => {
        if (c.style.display === 'none') return;
        const s = c.dataset.state;
        if (s === 'verified') verified++;
        else if (s === 'na') na++;
      });
      const visible = [...document.querySelectorAll('.manual-card')].filter(c => c.style.display !== 'none').length;
      const applicable = visible - na;
      const pct = applicable > 0 ? Math.round((verified / applicable) * 100) : (na === visible && visible > 0 ? 100 : 0);
      let label = verified + ' / ' + applicable + ' verified';
      if (na > 0) label += ' · ' + na + ' N/A';
      document.getElementById('manual-progress-label').textContent = label;
      document.getElementById('manual-progress-bar').style.width = pct + '%';
    }

    function applyCardState(card, state) {
      const header = card.querySelector('.manual-header');
      const badge = card.querySelector('.manual-badge');
      const verifiedBtn = card.querySelector('.manual-verified-btn');
      const naBtn = card.querySelector('.manual-na-btn');
      card.dataset.state = state || '';
      const BASE_VERIFIED = 'manual-verified-btn px-3 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap';
      const BASE_NA = 'manual-na-btn px-3 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap';
      card.classList.remove('border-amber-200', 'border-emerald-200', 'border-slate-300');
      header.classList.remove('from-amber-50\\/60', 'hover:from-amber-50', 'from-emerald-50\\/60', 'hover:from-emerald-50', 'from-slate-50\\/60', 'hover:from-slate-50');
      if (state === 'verified') {
        card.classList.add('border-emerald-200');
        header.classList.add('from-emerald-50\\/60', 'hover:from-emerald-50');
        badge.textContent = '✓ Verified';
        badge.className = 'manual-badge px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-700 border-emerald-200';
        if (verifiedBtn) verifiedBtn.className = BASE_VERIFIED + ' border-emerald-400 bg-emerald-100 text-emerald-700';
        if (naBtn) naBtn.className = BASE_NA + ' border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50';
      } else if (state === 'na') {
        card.classList.add('border-slate-300');
        header.classList.add('from-slate-50\\/60', 'hover:from-slate-50');
        badge.textContent = 'N/A';
        badge.className = 'manual-badge px-2.5 py-0.5 rounded-full text-xs font-bold border bg-slate-100 text-slate-600 border-slate-300';
        if (verifiedBtn) verifiedBtn.className = BASE_VERIFIED + ' border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50';
        if (naBtn) naBtn.className = BASE_NA + ' border-slate-400 bg-slate-100 text-slate-600';
      } else {
        card.classList.add('border-amber-200');
        header.classList.add('from-amber-50\\/60', 'hover:from-amber-50');
        badge.textContent = 'Manual';
        badge.className = 'manual-badge px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-100 text-amber-800 border-amber-200';
        if (verifiedBtn) verifiedBtn.className = BASE_VERIFIED + ' border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50';
        if (naBtn) naBtn.className = BASE_NA + ' border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50';
      }
    }

    function setManualState(criterion, newState) {
      const card = document.getElementById('manual-' + criterion.replace(/\\./g, '-'));
      const current = card ? card.dataset.state : '';
      const next = current === newState ? '' : newState;
      if (card) applyCardState(card, next);
      updateProgress();
    }

    function toggleCard(header) {
      const card = header.closest('.manual-card');
      const body = card.querySelector('.card-body');
      const chevron = header.querySelector('.card-chevron');
      const isCollapsed = card.dataset.collapsed === 'true';
      body.style.gridTemplateRows = isCollapsed ? '1fr' : '0fr';
      card.dataset.collapsed = isCollapsed ? 'false' : 'true';
      if (chevron) chevron.style.transform = isCollapsed ? 'rotate(180deg)' : '';
      header.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
      _syncExpandBtn();
    }

    function _visibleCards() {
      return [...document.querySelectorAll('.manual-card')].filter(c => c.style.display !== 'none');
    }

    function _syncExpandBtn() {
      const btn = document.getElementById('expand-all-btn');
      if (!btn) return;
      const anyCollapsed = _visibleCards().some(c => c.dataset.collapsed === 'true');
      btn.textContent = anyCollapsed ? 'Expand all' : 'Collapse all';
    }

    function toggleAllCards() {
      const cards = _visibleCards();
      const anyCollapsed = cards.some(c => c.dataset.collapsed === 'true');
      cards.forEach(card => {
        const body = card.querySelector('.card-body');
        const chevron = card.querySelector('.card-chevron');
        const header = card.querySelector('.card-header');
        body.style.gridTemplateRows = anyCollapsed ? '1fr' : '0fr';
        card.dataset.collapsed = anyCollapsed ? 'false' : 'true';
        if (chevron) chevron.style.transform = anyCollapsed ? 'rotate(180deg)' : '';
        if (header) header.setAttribute('aria-expanded', anyCollapsed ? 'true' : 'false');
      });
      const btn = document.getElementById('expand-all-btn');
      if (btn) btn.textContent = anyCollapsed ? 'Collapse all' : 'Expand all';
    }

    function filterChecks() {
      const q = document.getElementById('search-input').value.toLowerCase().trim();
      const level = document.getElementById('level-select').value;
      let visible = 0;
      document.querySelectorAll('.manual-card').forEach(card => {
        const cardLevel = card.dataset.level || '';
        const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
        const criterion = card.dataset.criterion?.toLowerCase() || '';
        const levelMatch = level === 'all' || cardLevel === level;
        const textMatch = !q || title.includes(q) || criterion.includes(q);
        if (levelMatch && textMatch) {
          card.style.display = '';
          visible++;
        } else {
          card.style.display = 'none';
        }
      });
      document.getElementById('empty-state').classList.toggle('hidden', visible > 0);
      _syncExpandBtn();
      updateProgress();
    }

    window.addEventListener('scroll', () => {
      document.getElementById('navbar').classList.toggle('shadow-md', window.scrollY > 20);
    });
  </script>

</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) throw new Error("Missing required --output flag.");

  const html = buildHtml(args);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, html, "utf-8");
  log.success(`Manual checklist written to ${args.output}`);
}

try {
  main();
} catch (error) {
  log.error(`Checklist Error: ${error.message}`);
  process.exit(1);
}
