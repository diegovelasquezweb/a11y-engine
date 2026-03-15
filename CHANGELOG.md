# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] — 2026-03-15

### Fixed

- Broken relative imports in `src/reports/` after architecture migration — report builders were resolving `../../core/` and `../renderers/` instead of `../core/` and `./renderers/`

---

## [0.4.1] — 2026-03-15

### Fixed

- Asset loader imports updated to match flattened `assets/` structure (removed `generated/` and `source/` subdirectories)

---

## [0.4.0] — 2026-03-15

### Changed

- **Architecture migration**: all source code moved from `scripts/` to `src/` with domain-based modules:
  - `src/cli/` — CLI adapter
  - `src/core/` — utilities, asset loader, toolchain
  - `src/pipeline/` — DOM scanner (axe + CDP + pa11y + merge)
  - `src/enrichment/` — finding analyzer
  - `src/reports/` — report builders and renderers
  - `src/source-patterns/` — source code pattern scanner
  - `src/index.mjs` — public API entry point
  - `src/index.d.mts` — TypeScript declarations
- Assets simplified to single `.mjs` modules under `assets/` (no more `source/` + `generated/` duplication)
- `assets/engine/` renamed to `assets/scanning/` for semantic clarity
- Package entrypoints updated: `main`, `types`, `bin`, `exports` all point to `src/`
- CLI now invocable via `pnpm exec a11y-audit` (uses package `bin` field instead of internal paths)

### Added

- Vitest regression suite: 8 test files, 26 tests covering asset loading, enrichment, summary, report APIs, source patterns, and `runAudit` integration with mocked modules

---

## [0.3.1] — 2026-03-15

### Changed

- Assets converted to ESM modules with static imports — eliminates runtime `fs.readFileSync` and resolves Turbopack/Next.js chunk resolution failures
- `asset-loader.mjs` now uses `import` statements instead of filesystem reads

---

## [0.3.0] — 2026-03-15

### Added

- **DOM-based stack detection** — detects framework (Next.js, Nuxt, Gatsby, Angular, Svelte, Astro, Remix, Vue, React), CMS (WordPress, Shopify, Drupal, Wix, Squarespace, Webflow, Joomla, Magento), and UI libraries (Bootstrap, Material UI, jQuery, Foundation) from the live page using window globals, script sources, meta tags, and DOM selectors
- `runAudit()` — new programmatic API function that orchestrates the full scan pipeline with `onProgress` callback support
- `detectProjectContextFromDom(page)` — runtime stack detection via `page.evaluate()`

### Changed

- Stack detection now merges repo-based detection (when `projectDir` is available) with DOM-based detection — repo takes priority, DOM fills gaps
- `detectProjectContext()` no longer falls back to `process.cwd()` without explicit `projectDir` — prevents false detection of the scanner/host app as the audited site
- `getAuditSummary` includes `cms` field in `detectedStack`
- UI library detection requires at least 2 signals or 1 strong signal (global/scriptSrc/meta) to avoid false positives

---

## [0.2.0] — 2026-03-14

### Added

- **Programmatic API** — 8 exported functions accessible via `import { ... } from "@diegovelasquezweb/a11y-engine"`:
  - `runAudit(options)` — runs the full scan pipeline programmatically with progress callback
  - `getEnrichedFindings(input, options?)` — normalizes, canonicalizes, enriches, and sorts findings
  - `getAuditSummary(findings, payload?)` — computes totals, score, personas, quick wins, detected stack
  - `getPDFReport(payload, options?)` — PDF compliance report
  - `getHTMLReport(payload, options?)` — interactive HTML dashboard
  - `getChecklist(options?)` — manual testing checklist
  - `getRemediationGuide(payload, options?)` — Markdown remediation guide
  - `getSourcePatterns(projectDir, options?)` — source code pattern analysis
- **TypeScript type declarations** shipped with the package (`src/index.d.mts`)

### Changed

- `getEnrichedFindings` always creates camelCase aliases regardless of existing fix data
- `getEnrichedFindings` infers `effort` after enrichment: findings with `fixCode` default to `"low"`, others to `"high"`
- `getAuditSummary` includes `quickWins`, `targetUrl`, and `detectedStack`

---

## [0.1.3] — 2026-03-14

### Added

- **Multi-engine scanning**: three independent engines now run against each page:
  - **axe-core** (via `@axe-core/playwright`) — primary WCAG rule engine injected into the live page
  - **CDP** (Chrome DevTools Protocol) — queries the browser's accessibility tree for missing accessible names and aria-hidden on focusable elements
  - **pa11y** (HTML CodeSniffer via Puppeteer) — catches heading hierarchy, link purpose, and form association issues
- Cross-engine merge and deduplication in `mergeViolations()` — removes duplicate findings across axe, CDP, and pa11y based on rule equivalence and selector matching
- Real-time `progress.json` with per-engine step tracking and finding counts (`found` for each engine, `merged` total after dedup)
- `--axe-tags` CLI flag for filtering axe-core WCAG tag sets (also determines pa11y standard)
- Non-visible element skip list for screenshots (`<meta>`, `<link>`, `<style>`, `<script>`, `<title>`, `<base>`) — prevents timeout warnings on elements that cannot be scrolled into view

### Changed

- `a11y-scan-results.json` now contains merged violations from all three engines (previously axe-core only)
- Each violation includes a `source` field (`"cdp"` or `"pa11y"`) to identify which engine produced it (axe-core violations have no `source` field for backwards compatibility)
- README rewritten to reflect multi-engine architecture
- All documentation (`architecture.md`, `cli-handbook.md`, `outputs.md`) updated to describe the three-engine pipeline, merge/dedup logic, progress tracking, and dual browser requirements

### Fixed

- Screenshot capture no longer attempts to scroll non-visible `<head>` elements into view

---

## [0.1.2] — 2026-03-13

### Fixed

- `bin` field in `package.json` — removed leading `./` from the entry path (`scripts/audit.mjs`) to satisfy npm bin resolution
- `repository.url` normalized to `git+https://` prefix as required by npm registry validation
- Missing shebang (`#!/usr/bin/env node`) added to `scripts/audit.mjs` so the `a11y-audit` binary executes correctly when installed globally or via `npx`

---

## [0.1.1] — 2026-03-13

### Added

- Engine scripts published as a standalone npm package:
  - `scripts/audit.mjs` — orchestrator for the full audit pipeline
  - `scripts/core/utils.mjs` — shared logging, path utilities, and defaults
  - `scripts/core/toolchain.mjs` — dependency and Playwright browser verification
  - `scripts/core/asset-loader.mjs` — JSON asset loading with error boundaries
  - `scripts/engine/dom-scanner.mjs` — Playwright + axe-core WCAG 2.2 AA scanner
  - `scripts/engine/analyzer.mjs` — finding enrichment with fix intelligence
  - `scripts/engine/source-scanner.mjs` — static source code pattern scanner
  - `scripts/reports/builders/` — orchestrators for each report format
  - `scripts/reports/renderers/` — rendering logic for HTML, PDF, Markdown, and checklist
- Asset files bundled under `assets/`:
  - `assets/reporting/compliance-config.json` — scoring weights, grade thresholds, and legal regulation mapping
  - `assets/reporting/wcag-reference.json` — WCAG criterion map, persona config, and persona–rule mapping
  - `assets/reporting/manual-checks.json` — 41 manual WCAG checks for the interactive checklist
  - `assets/discovery/crawler-config.json` — BFS crawl configuration defaults
  - `assets/discovery/stack-detection.json` — framework and CMS fingerprint signatures
  - `assets/remediation/intelligence.json` — per-rule fix intelligence (106 axe-core rules)
  - `assets/remediation/code-patterns.json` — source code pattern definitions
  - `assets/remediation/guardrails.json` — agent fix guardrails and scope rules
  - `assets/remediation/axe-check-maps.json` — axe check-to-rule mapping
  - `assets/remediation/source-boundaries.json` — framework-specific file location patterns
- `a11y-audit` binary registered in `bin` field — invocable via `npx a11y-audit` after install
- `LICENSE` (MIT)

---

## [0.1.0] — 2026-03-13

### Added

- Initial package scaffold: `package.json` for `@diegovelasquezweb/a11y-engine` with correct `name`, `version`, `type: module`, `engines`, `files`, and `scripts` fields
- `devDependencies`: `vitest` for test runner
- `dependencies`: `playwright`, `@axe-core/playwright`, `axe-core`, `pa11y`
