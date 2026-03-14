# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
