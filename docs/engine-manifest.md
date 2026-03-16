# Engine Manifest

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [Intelligence](intelligence.md) • [API Reference](api-reference.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md) • [Engine Manifest](engine-manifest.md) • [Testing](testing.md)

---

This document is the current technical inventory of the engine package.

## 1) Source Modules

| Path | Role |
| :--- | :--- |
| `src/index.mjs` | Public API entry point |
| `src/index.d.mts` | Public TypeScript declarations |
| `src/cli/audit.mjs` | CLI adapter and orchestration |
| `src/core/utils.mjs` | Logging, JSON I/O, shared helpers |
| `src/core/asset-loader.mjs` | Centralized asset map and loader |
| `src/core/toolchain.mjs` | Environment/toolchain checks |
| `src/core/github-api.mjs` | GitHub API client — `fetchPackageJson`, `fetchRepoFile`, `listRepoFiles`, `parseRepoUrl`. Used for remote repo scanning and AI source file fetching. |
| `src/pipeline/dom-scanner.mjs` | Runtime scan stage (axe/CDP/pa11y + merge) |
| `src/enrichment/analyzer.mjs` | Finding enrichment and metadata synthesis |
| `src/ai/claude.mjs` | Claude AI client — calls the Anthropic API to enrich findings with context-aware fix suggestions. Accepts custom system prompt via `options.systemPrompt`. |
| `src/ai/enrich.mjs` | CLI AI enrichment subprocess — reads `a11y-findings.json`, calls `enrichWithAI()`, writes enriched findings back. Activated by `ANTHROPIC_API_KEY` env var. |
| `src/source-patterns/source-scanner.mjs` | Source code pattern scanner — works with local `--project-dir` or remote `--repo-url` via GitHub API |
| `src/reports/html.mjs` | HTML report builder |
| `src/reports/pdf.mjs` | PDF report builder |
| `src/reports/md.mjs` | Markdown remediation builder |
| `src/reports/checklist.mjs` | Manual checklist builder |
| `src/reports/renderers/*.mjs` | Shared report rendering primitives |

## 2) Asset Modules

| Path | Purpose |
| :--- | :--- |
| `assets/discovery/crawler-config.mjs` | Crawl defaults and URL filters |
| `assets/discovery/stack-detection.mjs` | Runtime/source stack detection rules |
| `assets/scanning/cdp-checks.mjs` | CDP accessibility checks |
| `assets/scanning/pa11y-config.mjs` | pa11y mappings, ignores, canonicalization |
| `assets/remediation/intelligence.mjs` | Rule-level remediation intelligence |
| `assets/remediation/guardrails.mjs` | Safe-fix and ownership guardrails |
| `assets/remediation/code-patterns.mjs` | Source code pattern definitions |
| `assets/remediation/source-boundaries.mjs` | Framework source boundaries |
| `assets/remediation/axe-check-maps.mjs` | axe check-to-rule mappings |
| `assets/reporting/compliance-config.mjs` | Compliance scoring configuration |
| `assets/reporting/wcag-reference.mjs` | WCAG + persona mapping reference |
| `assets/reporting/manual-checks.mjs` | Manual checklist data |

## 3) Test Suite

All tests live under `tests/` and run with Vitest.

Current files:

- `tests/asset-loader.test.mjs`
- `tests/audit-summary.test.mjs`
- `tests/enriched-findings.test.mjs`
- `tests/reports-api.test.mjs`
- `tests/reports-paths.test.mjs`
- `tests/run-audit.integration.test.mjs`
- `tests/source-patterns.test.mjs`
- `tests/source-scanner-utils.test.mjs`