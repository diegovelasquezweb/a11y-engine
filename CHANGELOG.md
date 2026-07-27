# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-07-27

### Fixed

- **DOM findings inflated by cross-engine duplicates.** The scanner runs axe-core, CDP, and pa11y against the same rendered page, and when two engines flagged the same physical element with different rule wording (e.g. axe's `button-name` and pa11y's `H91.Button` on the same unlabeled button), each became a separate finding — inflating the reported total (a real audit showed "9 findings" for ~5 distinct broken elements). The existing `mergeViolations()` cross-engine dedup only compared raw selector *strings*, which rarely match across engines since axe, CDP, and pa11y each build selectors with a different algorithm; pa11y's own `equivalenceMap` (already present in `assets/scanning/pa11y-config.mjs`) was never wired in either, so pa11y-vs-axe dedup never fired at all.
- **Fix:** `mergeViolations()` now resolves each violation's selector against the live DOM (`page.evaluate`) to a structural identity (tag + child index chained to `<body>`), independent of which engine generated the selector text. A violation is dropped as a full duplicate only when *every* element it covers is already covered by an equivalent-rule violation seen earlier; a violation that only *partially* overlaps (e.g. pa11y bundling one already-seen element together with genuinely new ones) is kept in full, and an unresolvable selector is never dropped — the merge is conservative by design, since a false merge would silently hide a real, distinct accessibility bug.
- `mergeViolations()` is now `async` and exported, taking an injectable `resolveIdentities` resolver so its dedup logic is unit-testable without a real browser (`tests/dom-scanner-merge.test.mjs`, 7 tests).
- Added `puppeteer` as a direct dependency — it was already imported directly by `dom-scanner.mjs` but only ever resolved as a transitive dependency of `pa11y`; under pnpm's strict `node_modules` layout it's a phantom dependency (same class of bug fixed in `a11y-github-app` for `playwright` this same day) and wasn't reliably resolvable.

## [1.1.1] — 2026-07-27

### Fixed

- **`source-scanner.mjs` CLI entry point never ran under pnpm.** The `if (process.argv[1] === fileURLToPath(import.meta.url))` guard compared a raw invocation path against a symlink-resolved module URL. Under npm (real directories in `node_modules`) both happened to match; under pnpm (`node_modules/@scope/pkg` is a symlink into the content-addressable store) they never matched, so `main()` silently never ran — the script exited 0, printed nothing, and wrote no output file, with no error surfaced anywhere. Fixed by resolving both sides through `realpathSync` before comparing (`isMainModule()`, now exported for testing). Found via a real end-to-end `/a11y-audit source` run through `a11y-github-app` after that consumer's npm→pnpm migration — a plain `npm install` repro didn't reproduce it, only a `pnpm install` did.
- Added a regression test that invokes the scanner through an actual symlink (mirroring pnpm's layout) and asserts the output file is produced; confirmed it fails without the fix.

## [1.1.0] — 2026-07-27

### Added

- **4 new source-scan accessibility patterns (`PAT-*`)** from a fresh comparison against Vercel's Web Interface Guidelines: `label-not-associated` (label present but not connected to its control), `paste-blocked` (`onPaste` + `preventDefault` blocking clipboard input), `animate-non-compositor-prop` (animating `width`/`height`/`top`/`left`/`margin`/`padding` instead of `transform`/`opacity`), `zoom-disabled` (viewport `user-scalable=no` / `maximum-scale=1` or Next.js `userScalable`/`maximumScale`).

### Changed

- **`div-onclick`** no longer fires when the element already has `onKeyDown`/`onKeyUp` — it was only checking for `role="button"`, missing elements that already have keyboard support without the ARIA role.

### Notes

- `input-no-inputmode` was implemented and removed before release — a prior gap analysis had already flagged it as too context-heavy for a naive regex without further false-positive testing.
- Verified locally (via `source-scanner.mjs` run directly against `a11y-test-react`, no publish required) that all 22 patterns fire with `confirmed` status before this release.

## [1.0.0] — 2026-07-27

### Changed

- **Stable release.** The public API is now declared stable under Semantic Versioning. There are no functional changes from `0.12.0` — this release promotes the existing, battle-tested API to a `1.0.0` baseline so that consumers can safely use caret ranges (`^1.0.0`) and receive minor and patch updates automatically.

### Notes

- Versions `0.11.0` through the `0.11.x` series (between `0.10.3` and `0.12.0`) were published without changelog entries; refer to the git history for those changes. The `1.x` line resets changelog discipline — every future release is documented here.

---

## [0.12.0] — 2026-07-26

### Added

- **11 new source-scan accessibility patterns (`PAT-*`)** derived from Vercel's Web Interface Guidelines: `div-onclick`, `icon-btn-no-label`, `img-no-alt`, `icon-no-aria-hidden`, `async-no-aria-live`, `input-no-autocomplete`, `focus-vs-focus-visible`, `transition-all`, `img-no-dimensions`, `no-prefers-reduced-motion`, `spellcheck-on-sensitive`. Pure data additions to `assets/remediation/code-patterns.mjs` — no scanner code changes. Each carries severity, WCAG mapping, and false-positive mitigation (same-line negative lookaheads / `context_reject_regex`).
- **`tests/code-patterns.test.mjs`** — dedicated test suite covering positive/negative scenarios per pattern plus real-scanner (`scanPattern`) true-positive validation.

### Notes

- `img-no-alt` and `input-no-autocomplete` use same-line negative lookaheads so the resolving attribute (`alt=` / `autocomplete=`) is checked on the matched element only — avoiding cross-element false negatives and matching real React forms that key identity inputs off `type`/`id` rather than `name`.
- `icon-btn-no-label` matches only when `<button>` and its icon are on the same source line; multi-line JSX is a known limitation of the line-based scanner (a whole-file/multiline scanner mode is a separate follow-up).
- `div-onclick` and `async-no-aria-live` are validated via unit tests; demo-repo fixtures to exercise them end-to-end are a follow-up.

---

## [0.10.3] — 2026-03-16

### Added

- **3 new CDP checks** — `cdp-autoplay-media` (WCAG 1.4.2, 2.2.2 — serious), `cdp-missing-main-landmark` (WCAG 1.3.1 — moderate), `cdp-missing-skip-link` (WCAG 2.4.1 — moderate). These use `page.evaluate()` DOM inspection and complement the existing accessibility-tree-based CDP checks.
- **Intelligence entries for the 3 new CDP checks** — full fix descriptions, fix code, framework notes (React, Vue, Angular, Svelte, Astro), CMS notes (Shopify, WordPress, Drupal), and guardrails added to `assets/remediation/intelligence.mjs`.
- **`best-practice` and `ACT` as opt-in `axeTags`** — documented in API reference and type declarations. Pass `axeTags: ["wcag2a", "wcag2aa", "best-practice", "ACT"]` to include non-WCAG best practices and W3C ACT rules.
- **`passesCount`, `incompleteCount`, `inapplicableCount` in `ScanPayload.metadata`** — axe-core passes, incomplete, and inapplicable counts are now exposed as numeric fields in the metadata object.
- **`cdp-checks.test.mjs`** — new dedicated test file for DOM-eval CDP check logic.
- **pa11y shared Puppeteer browser** — a single Puppeteer browser is now launched once per scan and shared across all pa11y route invocations. Eliminates Chrome cold-start overhead (1-3s) per route. Falls back to per-route launch if Puppeteer is unavailable.
- **pa11y parallelized with axe+CDP** — pa11y now starts in parallel with the axe→CDP sequence instead of running sequentially after them. Since pa11y uses its own browser and receives only the URL, it is fully independent. This hides pa11y's latency behind axe+CDP, reducing per-route scan time.
- **`clearCache` option** — new `RunAuditOptions.clearCache` (default `false`). When `true`, clears browser cache via CDP `Network.clearBrowserCache` + `Network.setCacheDisabled` before each page navigation. Ensures fresh scan results on repeated scans of the same domain. Also available as `--clear-cache` CLI flag.
- **`serverMode` option** — new `RunAuditOptions.serverMode` (default `false`). When `true`, passes EC2/Docker-optimized Chrome launch flags to Playwright: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--no-zygote`, `--disable-accelerated-2d-canvas`. Use in CI, Docker, or EC2 environments. Also available as `--server-mode` CLI flag.

---

## [0.9.0] — 2026-03-16

### Changed

- **Knowledge API consolidated** — `getScannerHelp`, `getPersonaReference`, `getUiHelp`, `getConformanceLevels`, `getWcagPrinciples`, and `getSeverityLevels` are no longer part of the public API. They remain as internal helpers consumed by `getKnowledge`. `getUiHelp` renamed to `getConceptsAndGlossary` internally. `getKnowledge` is the single exported entry point for all knowledge data.
- TypeScript declarations (`src/index.d.mts`) updated to remove the six individual knowledge functions.
- `tests/knowledge-api.test.mjs` updated to reflect the consolidated API shape.

---

## [0.8.5] — 2026-03-16

### Fixed

- **pa11y merge no longer drops findings with shared selectors** — the merge step was discarding pa11y findings whenever any prior finding (from axe or CDP) targeted the same selector, regardless of rule. Now pa11y findings are only de-duplicated when the exact same `rule_id + selector` combination already exists.

---

## [0.8.4] — 2026-03-15

### Added

- **`DEFAULT_AI_SYSTEM_PROMPT` exported** — the default Claude system prompt is now part of the public API, allowing consumers to read, log, or extend it.
- **`VIEWPORT_PRESETS` exported** — four ready-made viewport presets (`Desktop`, `Laptop`, `Tablet`, `Mobile`) exported from the package root for use in scanner UI option pickers.
- **`dependabot.yml`** — automated dependency update configuration added.
- **Effort fallback** — `getFindings` now infers `effort` after intelligence enrichment so findings that gain a `fixCode` from the intelligence database are correctly rated `"low"`.

---

## [0.8.3] — 2026-03-15

### Fixed

- **`actual` field no longer contains axe preamble** — the `"Fix any of the following:"` prefix from axe `failureSummary` strings is now stripped in `analyzer.mjs`, producing a cleaner violation description.

### Added

- `SECURITY.md` — security policy and vulnerability reporting process.

---

## [0.8.2] — 2026-03-16

### Changed

- **Smarter AI source file selection** — `fetchSourceFilesForFindings` now scores candidate files by how many terms extracted from the finding's selector, class names, IDs, and title match the file path. Files most relevant to the specific failing element are fetched first instead of picking the first 3 files by extension.
- Extracted `extractSearchTermsFromFinding()` and `scoreFilePath()` helpers for reusable relevance scoring logic.

---

## [0.8.1] — 2026-03-16

### Added

- **Custom AI system prompt** — `enrichWithAI()` now accepts `options.systemPrompt` to override the default Claude system prompt at runtime.
- `enrich.mjs` reads `AI_SYSTEM_PROMPT` env var and passes it to `enrichWithAI()` — enabling per-scan prompt customization without code changes.
- `audit.mjs` forwards `AI_SYSTEM_PROMPT` env var to the `enrich.mjs` child process.

---

## [0.8.0] — 2026-03-16

### Changed

- **AI enrichment no longer overwrites original fix** — `enrich.mjs` now preserves the original `fix_description`/`fix_code` from the engine and stores Claude's output in separate fields: `ai_fix_description`, `ai_fix_code`, `ai_fix_code_lang`. Findings improved by AI are flagged with `aiEnhanced: true`.
- **AI system prompt rewritten** — Claude is now explicitly instructed to go beyond the generic fix: explain why the issue matters for real users, what specifically to look for in the codebase, and provide a production-quality code example different from the existing one.
- Default AI model updated to `claude-haiku-4-5-20251001`.

---

## [0.7.9] — 2026-03-16

### Added

- **AI enrichment CLI step** — `audit.mjs` now runs `src/ai/enrich.mjs` after the analyzer step when `ANTHROPIC_API_KEY` env var is present. Non-fatal: if AI fails, the pipeline continues with unenriched findings.
- `src/ai/enrich.mjs` — new CLI script that reads `a11y-findings.json`, calls `enrichWithAI()`, and writes enriched findings back. Reads `A11Y_REPO_URL` and `GH_TOKEN` env vars for repo-aware enrichment.
- `src/ai/claude.mjs` — Claude AI enrichment module. Enriches Critical and Serious findings with context-aware fix descriptions and code snippets. Uses `claude-haiku-4-5-20251001` by default. Fetches source files from the GitHub repo when `repoUrl` is available.

---

## [0.7.8] — 2026-03-16

### Fixed

- **pa11y ruleId normalization** — pa11y violation IDs (e.g. `WCAG2AAA.Principle1.Guideline1_4.1_4_6.G17`) are now normalized to a short, readable form (e.g. `pa11y-g17`) by taking only the last segment of the dotted code. Previously the full dotted path was used, producing unreadable badges like `Pa11y Wcag2aaa Principle1 Guideline1 4 1 4 6 G17`.

---

## [0.7.7] — 2026-03-15

### Added

- **`--repo-url` and `--github-token` CLI flags** — `audit.mjs` now accepts `--repo-url <github-url>` and `--github-token <token>`. When a repo URL is provided, the engine fetches `package.json` via the GitHub API to detect the project framework before running the analyzer, and passes the detected framework to both the analyzer and the source pattern scanner. No `git clone` required.
- `source-scanner.mjs` CLI now accepts `--repo-url` and `--github-token`. When `--repo-url` is provided (without `--project-dir`), it runs `scanPatternRemote()` against the GitHub API instead of the local filesystem.
- `detectProjectContext()` is now called in `audit.mjs` when a remote repo is provided, enabling framework-aware fix suggestions without a local clone.

### Changed

- `source-scanner.mjs`: `--project-dir` is no longer required when `--repo-url` is provided. `main()` is now async to support remote API calls.
- `audit.mjs`: pattern scanning is now triggered when either `--project-dir` or `--repo-url` is provided.

---

## [0.7.6] — 2026-03-15

### Changed

- HTML report renderer: updated Tailwind class syntax (`flex-shrink-0` → `shrink-0`, `bg-gradient-to-br` → `bg-linear-to-br`, `max-h-[360px]` → `max-h-90`).

---

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
