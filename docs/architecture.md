# Engine Architecture

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md)

---

## Table of Contents

- [Pipeline overview](#pipeline-overview)
- [Stage 1: DOM scanner](#stage-1-dom-scanner)
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
┌─────────────────────────────┐
│  Stage 1: DOM Scanner       │  Playwright + axe-core
│  dom-scanner.mjs            │  Route discovery + WCAG scan
└──────────────┬──────────────┘
               │ a11y-scan-results.json
               ▼
┌─────────────────────────────┐
│  Stage 1b: Source Scanner   │  Static regex analysis
│  source-scanner.mjs         │  (optional — requires --project-dir)
└──────────────┬──────────────┘
               │ merges into a11y-findings.json
               ▼
┌─────────────────────────────┐
│  Stage 2: Analyzer          │  Fix intelligence enrichment
│  analyzer.mjs               │  intelligence.json + guardrails
└──────────────┬──────────────┘
               │ a11y-findings.json
               ▼
┌─────────────────────────────┐
│  Stage 3: Report Builders   │  Parallel rendering
│  md / html / pdf / checklist│
└──────────────┬──────────────┘
               │
    ┌──────────┼──────────┬──────────────┐
    ▼          ▼          ▼              ▼
remediation  report    report         checklist
   .md       .html      .pdf            .html
```

## Stage 1: DOM scanner

**Script**: `scripts/engine/dom-scanner.mjs`

Launches a Playwright-controlled Chromium browser and runs axe-core against each discovered route.

**Route discovery**:
- If the site exposes a `sitemap.xml`, all listed URLs are scanned (up to `--max-routes`).
- Otherwise, BFS crawl starting from `--base-url`, following same-origin `<a href>` links up to `--crawl-depth` levels deep.
- Routes are deduplicated and normalized before scanning.

**Scanning**:
- 3 parallel browser tabs scan routes concurrently (~2–3× faster than sequential).
- axe-core 4.11+ runs WCAG 2.2 A, AA, and best-practice tag sets.
- Screenshots of affected elements are captured for each violation.
- `--color-scheme`, `--viewport`, `--wait-until`, and `--wait-ms` control the browser environment.

**Output**: `a11y-scan-results.json` — raw axe results per route with DOM snapshots.

### Optional: Source scanner

**Script**: `scripts/engine/source-scanner.mjs` — runs when `--project-dir` is set and `--skip-patterns` is not.

Performs static analysis of source files for accessibility issues axe cannot detect at runtime (e.g. focus outline suppression, missing alt text in templates). Uses regex patterns from `assets/remediation/code-patterns.json` scoped to framework-specific file boundaries from `assets/remediation/source-boundaries.json`.

Findings are classified as `confirmed` (pattern unambiguously matches) or `potential` (requires human verification).

## Stage 2: Analyzer

**Script**: `scripts/engine/analyzer.mjs`

Reads `a11y-scan-results.json` and enriches each violation with:

- **Fix intelligence** from `assets/remediation/intelligence.json` — 106 axe-core rules with code snippets, MDN links, framework-specific notes, and WCAG criterion mapping.
- **Selector scoring** — picks the most stable selector from axe's `nodes` list. Priority: `#id` > `[data-*]` > `[aria-*]` > `[type=]`, with penalty for Tailwind utility classes.
- **Framework context** — `assets/discovery/stack-detection.json` fingerprints the DOM to detect framework and CMS. Per-finding `framework_notes` and `cms_notes` are filtered to the detected stack.
- **Guardrails** — `assets/remediation/guardrails.json` defines scope rules that prevent agents from touching backend code, third-party scripts, or minified files.
- **Compliance scoring** — `assets/reporting/compliance-config.json` weights findings by severity to produce a 0–100 score with grade thresholds.
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
| `reporting/wcag-reference.json` | WCAG criterion map, persona config, persona–rule mapping |
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
