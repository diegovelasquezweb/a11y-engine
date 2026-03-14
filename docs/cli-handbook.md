# CLI Handbook

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md)

---

## Table of Contents

- [Basic usage](#basic-usage)
- [Prerequisites](#prerequisites)
- [Flag groups](#flag-groups)
  - [Targeting & scope](#targeting--scope)
  - [Audit intelligence](#audit-intelligence)
  - [Execution & emulation](#execution--emulation)
  - [Output generation](#output-generation)
- [Examples](#examples)
- [Exit codes](#exit-codes)

---

## Basic usage

```bash
npx a11y-audit --base-url <url> [options]
```

Or if installed locally:

```bash
node node_modules/@diegovelasquezweb/a11y-engine/scripts/audit.mjs --base-url <url> [options]
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
| `--project-dir` | `<path>` | — | Path to the audited project source. Enables the source code pattern scanner and framework auto-detection from `package.json`. |

**Route discovery logic**:
1. If the target has a `sitemap.xml`, all listed URLs are used (up to `--max-routes`).
2. Otherwise, BFS crawl from `--base-url`, following same-origin `<a href>` links.
3. `--routes` always takes precedence over both.

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

### Include source code intelligence

```bash
a11y-audit \
  --base-url http://localhost:3000 \
  --project-dir . \
  --with-reports \
  --output ./audit/report.html
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
