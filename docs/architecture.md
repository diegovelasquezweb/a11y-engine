# Engine Architecture

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md)

---

## Table of Contents

- [Pipeline overview](#pipeline-overview)
- [Stage 1: DOM scanner](#stage-1-dom-scanner)
  - [axe-core](#axe-core)
  - [CDP checks](#cdp-checks)
  - [pa11y](#pa11y)
  - [Merge and deduplication](#merge-and-deduplication)
- [Stage 1b: Source scanner](#optional-source-scanner)
- [Stage 2: Analyzer](#stage-2-analyzer)
- [Stage 3: Report builders](#stage-3-report-builders)
- [Assets and rule intelligence](#assets-and-rule-intelligence)
- [Execution model and timeouts](#execution-model-and-timeouts)

---

The engine operates as a three-stage pipeline. Each stage is an independent Node.js process spawned by `audit.mjs`. Stages communicate through JSON files written to `.audit/`.

## Pipeline overview

```
Target URL
    │
    ▼
┌─────────────────────────────────┐
│  Stage 1: DOM Scanner           │  Three engines per route:
│  dom-scanner.mjs                │
│                                 │
│  ┌──────────┐  ┌──────┐        │
│  │ axe-core │  │ CDP  │        │  Playwright Chromium
│  └────┬─────┘  └──┬───┘        │
│       │           │             │
│  ┌────▼───────────▼────┐       │
│  │      pa11y          │       │  Puppeteer Chrome
│  └────────┬────────────┘       │
│           │                    │
│  ┌────────▼────────────┐       │
│  │  Merge & Dedup      │       │
│  └────────┬────────────┘       │
└───────────┼─────────────────────┘
            │ a11y-scan-results.json
            │ progress.json
            ▼
┌─────────────────────────────────┐
│  Stage 1b: Source Scanner       │  Static regex analysis
│  source-scanner.mjs             │  (optional — requires --project-dir)
└───────────┬─────────────────────┘
            │ merges into a11y-findings.json
            ▼
┌─────────────────────────────────┐
│  Stage 2: Analyzer              │  Fix intelligence enrichment
│  analyzer.mjs                   │  intelligence.json + guardrails
└───────────┬─────────────────────┘
            │ a11y-findings.json
            ▼
┌─────────────────────────────────┐
│  Stage 3: Report Builders       │  Parallel rendering
│  md / html / pdf / checklist    │
└───────────┬─────────────────────┘
            │
    ┌───────┼──────────┬──────────────┐
    ▼       ▼          ▼              ▼
remediation report   report        checklist
   .md      .html     .pdf           .html
```

## Stage 1: DOM scanner

**Script**: `scripts/engine/dom-scanner.mjs`

Launches a Playwright-controlled Chromium browser, discovers routes, and runs three independent accessibility engines against each page. Results are merged and deduplicated before output.

### Route discovery

- If the site exposes a `sitemap.xml`, all listed URLs are scanned (up to `--max-routes`).
- Otherwise, BFS crawl starting from `--base-url`, following same-origin `<a href>` links up to `--crawl-depth` levels deep.
- Routes are deduplicated and normalized before scanning.
- 3 parallel browser tabs scan routes concurrently (~2-3x faster than sequential).

### axe-core

**Dependency**: `@axe-core/playwright`

The primary engine. Injects axe-core into the live page via Playwright and runs WCAG 2.2 A/AA tag checks. Covers the majority of automatable WCAG success criteria (~80+ rules).

- Configurable via `--axe-tags` (default: `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22a,wcag22aa`)
- Supports `--only-rule` for focused single-rule audits
- Supports `--exclude-selectors` to skip specific elements

### CDP checks

**Dependency**: Playwright's built-in CDP session (`page.context().newCDPSession()`)

Queries the browser's full accessibility tree via Chrome DevTools Protocol. Catches issues axe may miss because it operates on the computed accessibility tree rather than the DOM:

- **Missing accessible names** — interactive elements (`button`, `link`, `textbox`, `combobox`, etc.) with empty names in the accessibility tree
- **aria-hidden on focusable elements** — elements that are focusable but hidden from assistive technology

CDP findings use axe-compatible violation format with `source: "cdp"` for downstream processing.

### pa11y

**Dependency**: `pa11y` (which uses Puppeteer + Chrome internally)

Runs Squiz's HTML CodeSniffer against each page URL. Catches WCAG violations that axe and CDP may miss:

- Heading hierarchy issues
- Link purpose violations
- Form label associations
- Additional WCAG2AA/WCAG2AAA checks from HTML CodeSniffer's rule set

pa11y requires a separate Chrome installation (`npx puppeteer browsers install chrome`). This is separate from Playwright's Chromium. If Chrome is missing, pa11y fails silently (non-fatal) and the scan continues with axe + CDP only.

pa11y findings use axe-compatible violation format with `source: "pa11y"` for downstream processing.

### Merge and deduplication

After all three engines complete, `mergeViolations()` combines findings and removes cross-engine duplicates:

1. **axe findings** are added first as the baseline
2. **CDP findings** are checked against axe equivalents (e.g. `cdp-missing-accessible-name` maps to `button-name`, `link-name`, `input-name`, `aria-command-name`). Only truly new findings are added.
3. **pa11y findings** are checked against existing selectors. If the same element is already flagged by axe or CDP, the pa11y finding is dropped.

The merged violations are written to `a11y-scan-results.json` per route.

### Progress tracking

The scanner writes `progress.json` in real-time as each engine runs. This file is used by integrations (like `a11y-scanner`) for live progress UI:

```json
{
  "steps": {
    "page":  { "status": "done", "updatedAt": "..." },
    "axe":   { "status": "done", "updatedAt": "...", "found": 8 },
    "cdp":   { "status": "done", "updatedAt": "...", "found": 3 },
    "pa11y": { "status": "done", "updatedAt": "...", "found": 2 },
    "merge": { "status": "done", "updatedAt": "...", "axe": 8, "cdp": 3, "pa11y": 2, "merged": 11 }
  },
  "currentStep": "merge"
}
```

### Screenshots

After merging, element screenshots are captured for each violation. Non-visible elements (`<meta>`, `<link>`, `<script>`, etc.) are automatically skipped. Screenshots are stored in `.audit/screenshots/` and referenced by each violation's `screenshot_path` field.

### Optional: Source scanner

**Script**: `scripts/engine/source-scanner.mjs` — runs when `--project-dir` is set and `--skip-patterns` is not.

Performs static analysis of source files for accessibility issues no runtime engine can detect (e.g. focus outline suppression, missing alt text in templates). Uses regex patterns from `assets/remediation/code-patterns.json` scoped to framework-specific file boundaries from `assets/remediation/source-boundaries.json`.

Findings are classified as `confirmed` (pattern unambiguously matches) or `potential` (requires human verification).

## Stage 2: Analyzer

**Script**: `scripts/engine/analyzer.mjs`

Reads `a11y-scan-results.json` (which contains merged axe + CDP + pa11y results) and enriches each violation with:

- **Fix intelligence** from `assets/remediation/intelligence.json` — 106 axe-core rules with code snippets, MDN links, framework-specific notes, and WCAG criterion mapping. CDP and pa11y findings receive generic enrichment based on their rule structure.
- **Selector scoring** — picks the most stable selector from axe's `nodes` list. Priority: `#id` > `[data-*]` > `[aria-*]` > `[type=]`, with penalty for Tailwind utility classes.
- **Framework context** — `assets/discovery/stack-detection.json` fingerprints the DOM to detect framework and CMS. Per-finding `framework_notes` and `cms_notes` are filtered to the detected stack.
- **Guardrails** — `assets/remediation/guardrails.json` defines scope rules that prevent agents from touching backend code, third-party scripts, or minified files.
- **Compliance scoring** — `assets/reporting/compliance-config.json` weights findings by severity to produce a 0-100 score with grade thresholds.
- **Persona impact groups** — `assets/reporting/wcag-reference.json` maps findings to disability personas (visual, motor, cognitive, etc.).

**Output**: `a11y-findings.json` — enriched findings array with all intelligence fields.

## Stage 3: Report builders

All builders run in parallel when `--with-reports` is set. Each reads `a11y-findings.json` independently.

| Builder | Script | Output | Audience |
| :--- | :--- | :--- | :--- |
| Markdown | `reports/builders/md.mjs` | `remediation.md` | AI agents |
| HTML | `reports/builders/html.mjs` | `report.html` | Developers |
| PDF | `reports/builders/pdf.mjs` | `report.pdf` | Stakeholders |
| Checklist | `reports/builders/checklist.mjs` | `checklist.html` | QA / Developers |

The `remediation.md` builder always runs (even without `--with-reports`) since it is the primary output for AI agent consumption.

Renderers in `scripts/reports/renderers/` contain the actual rendering logic — builders are thin orchestrators that call renderers and write output files.

## Assets and rule intelligence

Assets are static JSON files bundled with the package under `assets/`. They are read at runtime by the analyzer and report builders.

| Asset | Purpose |
| :--- | :--- |
| `reporting/compliance-config.json` | Score weights, grade thresholds, legal regulation list |
| `reporting/wcag-reference.json` | WCAG criterion map, persona config, persona-rule mapping |
| `reporting/manual-checks.json` | 41 manual checks for the WCAG checklist |
| `discovery/crawler-config.json` | BFS crawl defaults (timeouts, concurrency) |
| `discovery/stack-detection.json` | Framework/CMS DOM fingerprints |
| `remediation/intelligence.json` | Per-rule fix intelligence for 106 axe-core rules |
| `remediation/code-patterns.json` | Source code pattern definitions |
| `remediation/guardrails.json` | Agent fix scope guardrails |
| `remediation/axe-check-maps.json` | axe check-to-rule mapping |
| `remediation/source-boundaries.json` | Framework-specific source file locations |

## Execution model and timeouts

`audit.mjs` spawns each stage as a child process via `node:child_process`. All child processes:

- Inherit the parent's environment
- Run with `cwd` set to the package root (`SKILL_ROOT`)
- Have a hard timeout of **15 minutes** (configurable via the `SCRIPT_TIMEOUT_MS` constant)

The orchestrator exits with code `1` if any stage fails. Individual stage timeouts are also enforced per page via `--timeout-ms` (default: 30s).

If `node_modules/` is absent on first run, the orchestrator automatically installs dependencies via `pnpm install` (falls back to `npm install`).
