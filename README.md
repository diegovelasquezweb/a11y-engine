# @diegovelasquezweb/a11y-engine

WCAG 2.2 AA accessibility audit engine. Runs Playwright + axe-core scans, enriches findings with fix intelligence, and produces structured artifacts for developers, agents, and stakeholders.

## What it is

A Node.js CLI and programmatic engine that:

1. Crawls a target URL and discovers routes automatically
2. Runs axe-core WCAG 2.2 AA checks across all discovered pages
3. Optionally scans project source code for patterns axe cannot detect at runtime
4. Enriches each finding with stack-aware fix guidance, selectors, and verification commands
5. Produces a full artifact set: JSON data, Markdown remediation guide, HTML dashboard, PDF compliance report, and manual testing checklist

## Why use this engine

| Capability | With this engine | Without |
| :--- | :--- | :--- |
| **WCAG 2.2 AA Coverage** | axe-core runtime scan + source code pattern scanner | Runtime scan only — misses CSS/source-level issues |
| **Fix Intelligence** | Stack-aware patches with code snippets tailored to detected framework | Raw rule violations with no remediation context |
| **Structured Artifacts** | JSON + Markdown + HTML + PDF + Checklist — ready to consume or forward | Findings exist only in the terminal session |
| **CI/Agent Integration** | Deterministic exit codes, stdout-parseable output paths, JSON schema | Requires wrapper scripting |

## Installation

```bash
npm install @diegovelasquezweb/a11y-engine
npx playwright install chromium
```

```bash
pnpm add @diegovelasquezweb/a11y-engine
pnpm exec playwright install chromium
```

> Chromium must be installed separately. The engine uses Playwright's bundled browser — not a system Chrome.

## Quick start

```bash
# Minimal scan — produces remediation.md in .audit/
npx a11y-audit --base-url https://example.com

# Full audit with all reports
npx a11y-audit --base-url https://example.com --with-reports --output ./audit/report.html

# Scan with source code intelligence (for stack-aware fix guidance)
npx a11y-audit --base-url http://localhost:3000 --project-dir . --with-reports --output ./audit/report.html
```

## CLI usage

```
a11y-audit --base-url <url> [options]
```

### Targeting & scope

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--base-url` | `<url>` | (Required) | Starting URL for the audit. |
| `--max-routes` | `<num>` | `10` | Max routes to discover and scan. |
| `--crawl-depth` | `<num>` | `2` | BFS link-follow depth during discovery (1–3). |
| `--routes` | `<csv>` | — | Explicit path list, bypasses auto-discovery. |
| `--project-dir` | `<path>` | — | Path to project source. Enables source pattern scanner and framework auto-detection. |

### Audit intelligence

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--target` | `<text>` | `WCAG 2.2 AA` | Compliance target label in reports. |
| `--only-rule` | `<id>` | — | Run a single axe rule (e.g. `color-contrast`). |
| `--ignore-findings` | `<csv>` | — | Rule IDs to exclude from output. |
| `--exclude-selectors` | `<csv>` | — | CSS selectors to skip during DOM scan. |
| `--framework` | `<name>` | — | Override auto-detected stack. Supported: `nextjs`, `gatsby`, `react`, `nuxt`, `vue`, `angular`, `astro`, `svelte`, `shopify`, `wordpress`, `drupal`. |

### Execution & emulation

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--color-scheme` | `light\|dark` | `light` | Emulate `prefers-color-scheme`. |
| `--wait-until` | `domcontentloaded\|load\|networkidle` | `domcontentloaded` | Playwright page load strategy. Use `networkidle` for SPAs. |
| `--viewport` | `<WxH>` | — | Viewport size (e.g. `375x812`, `1440x900`). |
| `--wait-ms` | `<num>` | `2000` | Delay after page load before running axe (ms). |
| `--timeout-ms` | `<num>` | `30000` | Network timeout per page (ms). |
| `--headed` | — | `false` | Run browser in visible mode. |
| `--affected-only` | — | `false` | Re-scan only routes with previous violations. Requires a prior scan in `.audit/`. |

### Output generation

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--with-reports` | — | `false` | Generate HTML + PDF + Checklist reports. Requires `--output`. |
| `--skip-reports` | — | `true` | Skip visual report generation (default). |
| `--output` | `<path>` | — | Output path for `report.html` (PDF and checklist derive from it). |
| `--skip-patterns` | — | `false` | Disable source code pattern scanner even when `--project-dir` is set. |

## Common command patterns

```bash
# Focused audit — one rule, one route
a11y-audit --base-url https://example.com --only-rule color-contrast --routes /checkout --max-routes 1

# Dark mode audit
a11y-audit --base-url https://example.com --color-scheme dark

# SPA with deferred rendering
a11y-audit --base-url https://example.com --wait-until networkidle --wait-ms 3000

# Mobile viewport
a11y-audit --base-url https://example.com --viewport 375x812

# Fast re-audit after fixes (skips clean pages)
a11y-audit --base-url https://example.com --affected-only

# Ignore known false positives
a11y-audit --base-url https://example.com --ignore-findings color-contrast,frame-title
```

## Output artifacts

All artifacts are written to `.audit/` relative to the package root.

| File | Always generated | Description |
| :--- | :--- | :--- |
| `a11y-scan-results.json` | Yes | Raw axe-core results per route |
| `a11y-findings.json` | Yes | Enriched findings with fix intelligence |
| `remediation.md` | Yes | AI-agent-optimized remediation roadmap |
| `report.html` | With `--with-reports` | Interactive HTML dashboard |
| `report.pdf` | With `--with-reports` | Formal compliance PDF |
| `checklist.html` | With `--with-reports` | Manual WCAG testing checklist |

See [Output Artifacts](docs/outputs.md) for full schema reference.

## Troubleshooting

**`Error: browserType.launch: Executable doesn't exist`**
Run `npx playwright install chromium` (or `pnpm exec playwright install chromium`).

**`Missing required argument: --base-url`**
The flag is required. Provide a full URL including protocol: `--base-url https://example.com`.

**Scan returns 0 findings on an SPA**
Use `--wait-until networkidle --wait-ms 3000` to let async content render before axe runs.

**`--with-reports` exits without generating PDF**
Ensure `--output` is also set and points to an `.html` file path: `--output ./audit/report.html`.

**Chromium crashes in CI**
Add `--no-sandbox` via the `PLAYWRIGHT_CHROMIUM_LAUNCH_OPTIONS` env var, or run Playwright with the `--with-deps` flag during browser installation.

## Documentation

| Resource | Description |
| :--- | :--- |
| [Architecture](https://github.com/diegovelasquezweb/a11y-engine/blob/main/docs/architecture.md) | How the scanner → analyzer → report pipeline works |
| [CLI Handbook](https://github.com/diegovelasquezweb/a11y-engine/blob/main/docs/cli-handbook.md) | Full flag reference and usage patterns |
| [Output Artifacts](https://github.com/diegovelasquezweb/a11y-engine/blob/main/docs/outputs.md) | Schema and structure of every generated file |

## License

MIT
