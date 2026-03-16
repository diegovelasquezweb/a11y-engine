# CLI Handbook

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [Intelligence](intelligence.md) • [API Reference](api-reference.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md) • [Engine Manifest](engine-manifest.md) • [Testing](testing.md)

---

## Table of Contents

- [Basic usage](#basic-usage)
- [Prerequisites](#prerequisites)
- [Flag groups](#flag-groups)
  - [Targeting & scope](#targeting--scope)
  - [Repository & remote scanning](#repository--remote-scanning)
  - [AI enrichment](#ai-enrichment)
  - [Audit intelligence](#audit-intelligence)
  - [Execution & emulation](#execution--emulation)
  - [Output generation](#output-generation)
- [Environment variables](#environment-variables)
- [Examples](#examples)
- [Exit codes](#exit-codes)

---

## Basic usage

```bash
npx a11y-audit --base-url <url> [options]
```

Or via pnpm in a project that depends on the engine:

```bash
pnpm exec a11y-audit --base-url <url> [options]
```

The only required flag is `--base-url`. All other flags are optional.

---

## Prerequisites

The engine uses two separate browser installations:

```bash
# Required — used by axe-core and CDP checks
npx playwright install chromium

# Required for pa11y — uses Puppeteer's Chrome (separate from Playwright)
npx puppeteer browsers install chrome
```

If Puppeteer Chrome is missing, pa11y checks fail silently (non-fatal) and the scan continues with axe-core + CDP only.

---

## Flag groups

### Targeting & scope

Controls what gets scanned.

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--base-url` | `<url>` | (Required) | Starting URL. Must include protocol (`https://` or `http://`). |
| `--max-routes` | `<num>` | `10` | Maximum unique same-origin paths to discover and scan. |
| `--crawl-depth` | `<num>` | `2` | How deep to follow links during BFS discovery (1-3). Has no effect when `--routes` is set. |
| `--routes` | `<csv>` | — | Explicit paths to scan (e.g. `/,/about,/contact`). Overrides auto-discovery entirely. |
| `--project-dir` | `<path>` | — | Path to the audited project source on disk. Enables source code pattern scanning and framework auto-detection from the local `package.json`. |

**Route discovery logic**:
1. If the target has a `sitemap.xml`, all listed URLs are used (up to `--max-routes`).
2. Otherwise, BFS crawl from `--base-url`, following same-origin `<a href>` links.
3. `--routes` always takes precedence over both.

---

### Repository & remote scanning

Enables source code analysis via the GitHub API — no `git clone` required.

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--repo-url` | `<url>` | — | GitHub repository URL (e.g. `https://github.com/owner/repo`). Fetches `package.json` for framework detection and runs source code pattern scanning against the repo via the GitHub API. Mutually exclusive with `--project-dir` for remote usage. |
| `--github-token` | `<token>` | — | GitHub personal access token. Increases the GitHub API rate limit from 60 to 5,000 req/hour. Required for private repositories. Falls back to `GH_TOKEN` env var if not provided. |

When `--repo-url` is provided:
1. The engine fetches `package.json` via `raw.githubusercontent.com` to detect the project framework.
2. Source code patterns are run against the repo file tree using the GitHub Trees API and Contents API, with no local filesystem access.
3. The detected framework is passed to the analyzer for framework-specific fix notes.

---

### AI enrichment

Controls Claude-powered fix suggestion enrichment. Requires `ANTHROPIC_API_KEY` to be set.

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| *(no flag)* | — | — | AI enrichment is activated automatically when `ANTHROPIC_API_KEY` env var is present. There is no `--ai-enabled` flag — set or unset the env var to control it. |

AI enrichment runs after the analyzer step and enriches Critical and Serious findings (up to 20 per scan) with:
- A specific fix description referencing the actual selector, colors, and violation data
- A production-quality code snippet in the correct framework syntax
- Context-aware suggestions when repo source files are available via `--repo-url`

Original engine fixes are always preserved. AI output is stored in separate fields (`ai_fix_description`, `ai_fix_code`). Enriched findings are flagged with `aiEnhanced: true`.

The system prompt is customizable via `AI_SYSTEM_PROMPT` env var.

---

### Audit intelligence

Controls how findings are interpreted and filtered.

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--target` | `<text>` | `WCAG 2.2 AA` | Compliance target label rendered in reports. Does not change which rules run. |
| `--only-rule` | `<id>` | — | Run a single axe rule ID only. Useful for focused re-audits after fixing a specific issue. |
| `--ignore-findings` | `<csv>` | — | Comma-separated list of axe rule IDs to suppress from output entirely. |
| `--exclude-selectors` | `<csv>` | — | CSS selectors to skip. Elements matching these selectors are excluded from axe scanning. |
| `--axe-tags` | `<csv>` | `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22a,wcag22aa` | axe-core WCAG tag filter. Also determines the pa11y standard (`WCAG2A`, `WCAG2AA`, or `WCAG2AAA`). |
| `--framework` | `<name>` | — | Override auto-detected framework. Affects which fix notes and source boundaries are applied. |

**Supported `--framework` values**: `nextjs`, `gatsby`, `react`, `nuxt`, `vue`, `angular`, `astro`, `svelte`, `shopify`, `wordpress`, `drupal`.

---

### Execution & emulation

Controls browser behavior during scanning.

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--color-scheme` | `light\|dark` | `light` | Emulates `prefers-color-scheme` media query. |
| `--wait-until` | `domcontentloaded\|load\|networkidle` | `domcontentloaded` | Playwright page load strategy. Use `networkidle` for SPAs with async rendering. |
| `--viewport` | `<WxH>` | `1280x800` | Browser viewport in pixels (e.g. `375x812` for mobile, `1440x900` for desktop). |
| `--wait-ms` | `<num>` | `2000` | Fixed delay (ms) after page load before the engines run. Useful when JS renders content after `DOMContentLoaded`. |
| `--timeout-ms` | `<num>` | `30000` | Network timeout per page load (ms). |
| `--headed` | — | `false` | Launch browser in visible mode. Useful for debugging page rendering issues. |
| `--affected-only` | — | `false` | Re-scan only routes that had violations in the previous scan. Reads `.audit/a11y-scan-results.json` to determine affected routes. Falls back to full scan if no prior results exist. |

---

### Output generation

Controls what artifacts are written.

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--with-reports` | — | `false` | Generate full artifact set: `report.html`, `report.pdf`, `checklist.html`, and `remediation.md`. Requires `--output`. |
| `--skip-reports` | — | `true` | Default behavior. Only `remediation.md` is generated. |
| `--output` | `<path>` | — | Absolute or relative path for `report.html`. PDF and checklist are derived from the same directory. |
| `--skip-patterns` | — | `false` | Disable source code pattern scanner even when `--project-dir` is set. Use this for DOM-only results without static analysis. |

---

## Environment variables

| Variable | Description |
| :--- | :--- |
| `ANTHROPIC_API_KEY` | Enables Claude AI enrichment. Set to a valid Anthropic API key. When absent, AI enrichment is silently skipped. |
| `AI_SYSTEM_PROMPT` | Custom system prompt for Claude. Overrides the default prompt for the entire scan. Useful for domain-specific fix guidance or custom output formats. |
| `GH_TOKEN` | GitHub personal access token. Used by the AI enrichment step when fetching source files from the repo. Equivalent to `--github-token` but read from the environment. |

---

## Examples

### Minimal scan

```bash
# Produces only remediation.md in .audit/
a11y-audit --base-url https://example.com
```

### Full audit with all reports

```bash
a11y-audit \
  --base-url https://example.com \
  --with-reports \
  --output ./audit/report.html
```

### Include source code intelligence (local)

```bash
a11y-audit \
  --base-url http://localhost:3000 \
  --project-dir . \
  --with-reports \
  --output ./audit/report.html
```

### Scan with remote GitHub repository (no clone)

```bash
a11y-audit \
  --base-url https://example.com \
  --repo-url https://github.com/owner/repo \
  --github-token ghp_...
```

### Scan with AI enrichment

```bash
ANTHROPIC_API_KEY=sk-ant-... a11y-audit \
  --base-url https://example.com \
  --repo-url https://github.com/owner/repo \
  --github-token ghp_...
```

### Scan with custom AI system prompt

```bash
AI_SYSTEM_PROMPT="You are an expert in Vue.js accessibility. Focus on component-level fixes." \
ANTHROPIC_API_KEY=sk-ant-... \
a11y-audit --base-url https://example.com --repo-url https://github.com/owner/repo
```

### Focused re-audit — single rule, single route

```bash
a11y-audit \
  --base-url https://example.com \
  --only-rule color-contrast \
  --routes /checkout \
  --max-routes 1
```

### Fast re-audit after applying fixes

```bash
# Only re-scans routes that had violations in the last run
a11y-audit --base-url https://example.com --affected-only
```

### SPA with deferred rendering

```bash
a11y-audit \
  --base-url https://example.com \
  --wait-until networkidle \
  --wait-ms 3000
```

### Dark mode audit

```bash
a11y-audit --base-url https://example.com --color-scheme dark
```

### Mobile viewport

```bash
a11y-audit --base-url https://example.com --viewport 375x812
```

### Suppress known false positives

```bash
a11y-audit \
  --base-url https://example.com \
  --ignore-findings color-contrast,frame-title
```

### Explicit route list

```bash
a11y-audit \
  --base-url https://example.com \
  --routes /,/pricing,/blog,/contact
```

### Override framework detection

```bash
a11y-audit \
  --base-url http://localhost:3000 \
  --framework nextjs \
  --project-dir .
```

### Custom axe-core WCAG tags

```bash
# Only WCAG 2.0 A checks
a11y-audit --base-url https://example.com --axe-tags wcag2a

# Include AAA checks
a11y-audit --base-url https://example.com --axe-tags wcag2a,wcag2aa,wcag2aaa
```

---

## Exit codes

| Code | Meaning |
| :--- | :--- |
| `0` | Audit completed successfully (regardless of findings count) |
| `1` | Runtime error — invalid URL, missing required flag, stage failure, or timeout |

The engine never exits `1` just because findings were found. Exit `1` only indicates a pipeline or configuration error.

**Stdout markers** (parseable by scripts and CI):

```
REMEDIATION_PATH=<abs-path>   # always printed on success
REPORT_PATH=<abs-path>        # only printed when --with-reports is set
```

## Programmatic alternative

For applications that embed the engine as a dependency (e.g. web dashboards, CI pipelines), the engine also exports a programmatic API that processes scan data in memory without filesystem operations. See the [README](../README.md#programmatic-api) for full documentation.
