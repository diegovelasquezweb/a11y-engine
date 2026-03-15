# @diegovelasquezweb/a11y-engine

Multi-engine WCAG 2.2 accessibility audit engine. Combines three scanning engines (axe-core, Chrome DevTools Protocol, and pa11y), merges and deduplicates their findings, enriches results with fix intelligence, and produces structured artifacts for developers, agents, and stakeholders.

## What it is

A Node.js package that works two ways:

1. **CLI** — run `npx a11y-audit --base-url <url>` to scan a site and generate reports
2. **Programmatic API** — import functions directly to normalize findings, compute scores, and generate reports in your own application

## Programmatic API

```bash
npm install @diegovelasquezweb/a11y-engine
```

```ts
import {
  getEnrichedFindings,
  getAuditSummary,
  getPDFReport,
  getChecklist,
  getHTMLReport,
  getRemediationGuide,
  getSourcePatterns,
} from "@diegovelasquezweb/a11y-engine";
```

### getEnrichedFindings

Normalizes raw scan findings, canonicalizes pa11y rules to axe equivalents, enriches with fix intelligence, infers effort, and sorts by severity.

```ts
const findings = getEnrichedFindings(scanPayload, {
  screenshotUrlBuilder: (path) => `/api/screenshot?path=${encodeURIComponent(path)}`,
});
```

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `input` | `ScanPayload \| Finding[] \| Record<string, unknown>[]` | Raw scan output or findings array |
| `options.screenshotUrlBuilder` | `(rawPath: string) => string` | Transforms screenshot file paths into consumer-specific URLs |

**Returns**: `EnrichedFinding[]` — normalized, enriched, sorted findings with both snake_case and camelCase fields.

### getAuditSummary

Computes a complete audit summary from enriched findings.

```ts
const summary = getAuditSummary(findings, scanPayload);
// summary.score         → 72
// summary.label         → "Good"
// summary.wcagStatus    → "Fail"
// summary.totals        → { Critical: 1, Serious: 3, Moderate: 5, Minor: 2 }
// summary.personaGroups → { screenReader: {...}, keyboard: {...}, ... }
// summary.quickWins     → [top 3 fixable Critical/Serious findings]
// summary.targetUrl     → "https://example.com"
// summary.detectedStack → { framework: "nextjs", cms: null, uiLibraries: [] }
```

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `findings` | `EnrichedFinding[]` | Output from `getEnrichedFindings` |
| `payload` | `ScanPayload \| null` | Original scan payload for metadata extraction |

**Returns**: `AuditSummary`

### getPDFReport

Generates a formal A4 PDF compliance report using Playwright.

```ts
const { buffer, contentType } = await getPDFReport(scanPayload, {
  baseUrl: "https://example.com",
});
fs.writeFileSync("report.pdf", buffer);
```

**Returns**: `Promise<PDFReport>` — `{ buffer: Buffer, contentType: "application/pdf" }`

### getHTMLReport

Generates an interactive HTML audit dashboard with severity filters, persona impact, and fix guidance.

```ts
const { html, contentType } = await getHTMLReport(scanPayload, {
  baseUrl: "https://example.com",
  screenshotsDir: "/path/to/.audit/screenshots",
});
```

**Returns**: `Promise<HTMLReport>` — `{ html: string, contentType: "text/html" }`

### getChecklist

Generates a standalone manual accessibility testing checklist.

```ts
const { html, contentType } = await getChecklist({
  baseUrl: "https://example.com",
});
```

**Returns**: `Promise<ChecklistReport>` — `{ html: string, contentType: "text/html" }`

### getRemediationGuide

Generates a Markdown remediation guide optimized for AI agents.

```ts
const { markdown, contentType } = await getRemediationGuide(scanPayload, {
  baseUrl: "https://example.com",
  patternFindings: sourcePatternResult,
});
```

**Returns**: `Promise<RemediationGuide>` — `{ markdown: string, contentType: "text/markdown" }`

### getSourcePatterns

Scans project source code for accessibility patterns not detectable by axe-core at runtime.

```ts
const { findings, summary } = await getSourcePatterns("/path/to/project", {
  framework: "nextjs",
});
// summary → { total: 12, confirmed: 10, potential: 2 }
```

**Returns**: `Promise<SourcePatternResult>` — `{ findings: SourcePatternFinding[], summary: { total, confirmed, potential } }`

## CLI usage

The CLI runs the full scan pipeline: crawl, scan with 3 engines, merge, analyze, and generate reports.

```bash
# Minimal scan
npx a11y-audit --base-url https://example.com

# Full audit with all reports
npx a11y-audit --base-url https://example.com --with-reports --output ./audit/report.html

# Scan with source code intelligence
npx a11y-audit --base-url http://localhost:3000 --project-dir . --with-reports --output ./audit/report.html
```

### Targeting and scope

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--base-url` | `<url>` | (Required) | Starting URL for the audit |
| `--max-routes` | `<num>` | `10` | Max routes to discover and scan |
| `--crawl-depth` | `<num>` | `2` | BFS link-follow depth during discovery (1-3) |
| `--routes` | `<csv>` | — | Explicit path list, bypasses auto-discovery |
| `--project-dir` | `<path>` | — | Path to project source for stack-aware fixes and source pattern scanning |

### Audit intelligence

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--target` | `<text>` | `WCAG 2.2 AA` | Compliance target label in reports |
| `--axe-tags` | `<csv>` | `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22a,wcag22aa` | axe-core WCAG tag filter |
| `--only-rule` | `<id>` | — | Run a single axe rule (e.g. `color-contrast`) |
| `--ignore-findings` | `<csv>` | — | Rule IDs to exclude from output |
| `--exclude-selectors` | `<csv>` | — | CSS selectors to skip during DOM scan |
| `--framework` | `<name>` | — | Override auto-detected stack (`nextjs`, `react`, `vue`, `angular`, `svelte`, `shopify`, `wordpress`, etc.) |

### Execution and emulation

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--color-scheme` | `light\|dark` | `light` | Emulate `prefers-color-scheme` |
| `--wait-until` | `domcontentloaded\|load\|networkidle` | `domcontentloaded` | Playwright page load strategy |
| `--viewport` | `<WxH>` | — | Viewport size (e.g. `375x812`) |
| `--wait-ms` | `<num>` | `2000` | Delay after page load before scanning (ms) |
| `--timeout-ms` | `<num>` | `30000` | Network timeout per page (ms) |
| `--headed` | — | `false` | Run browser in visible mode |
| `--affected-only` | — | `false` | Re-scan only routes with previous violations |

### Output generation

| Flag | Argument | Default | Description |
| :--- | :--- | :--- | :--- |
| `--with-reports` | — | `false` | Generate HTML + PDF + Checklist reports |
| `--output` | `<path>` | — | Output path for `report.html` |
| `--skip-patterns` | — | `false` | Disable source code pattern scanner |

## How the scan pipeline works

```
URL
 |
 v
[1. Crawl & Discover]  sitemap.xml / BFS link crawl / explicit --routes
 |
 v
[2. Navigate]           Playwright opens each route in Chromium
 |
 +---> [axe-core]       Injects axe into the page, runs WCAG tag checks
 |
 +---> [CDP]            Opens a CDP session, reads the full accessibility tree
 |
 +---> [pa11y]          Launches HTML CodeSniffer via Puppeteer Chrome
 |
 v
[3. Merge & Dedup]      Combines findings, removes cross-engine duplicates
 |
 v
[4. Analyze]            Enriches with WCAG mapping, severity, fix code, framework hints
 |
 v
[5. Reports]            HTML dashboard, PDF, checklist, Markdown remediation
```

## Scan engines

### axe-core (via @axe-core/playwright)

The primary engine. Runs Deque's axe-core rule set against the live DOM inside Playwright's Chromium. Covers the majority of automatable WCAG 2.2 AA success criteria.

### CDP (Chrome DevTools Protocol)

Queries the browser's full accessibility tree via a CDP session. Catches issues axe may miss:
- Interactive elements with no accessible name
- Focusable elements hidden with `aria-hidden`

### pa11y (HTML CodeSniffer)

Runs Squiz's HTML CodeSniffer via Puppeteer Chrome. Catches WCAG violations around heading hierarchy, link purpose, and form label associations.

Requires a separate Chrome installation (`npx puppeteer browsers install chrome`). If Chrome is missing, pa11y fails silently and the scan continues with axe + CDP.

## Output artifacts

All artifacts are written to `.audit/` relative to the package root.

| File | Always generated | Description |
| :--- | :--- | :--- |
| `a11y-scan-results.json` | Yes | Raw merged results from axe + CDP + pa11y per route |
| `a11y-findings.json` | Yes | Enriched findings with fix intelligence |
| `progress.json` | Yes | Real-time scan progress with per-engine step status |
| `remediation.md` | Yes | AI-agent-optimized remediation roadmap |
| `report.html` | With `--with-reports` | Interactive HTML dashboard |
| `report.pdf` | With `--with-reports` | Formal compliance PDF |
| `checklist.html` | With `--with-reports` | Manual WCAG testing checklist |

## Installation

```bash
npm install @diegovelasquezweb/a11y-engine
npx playwright install chromium
npx puppeteer browsers install chrome
```

> **Two browsers are required:**
> - **Playwright Chromium** — used by axe-core and CDP checks
> - **Puppeteer Chrome** — used by pa11y (HTML CodeSniffer)

## Documentation

| Resource | Description |
| :--- | :--- |
| [Architecture](docs/architecture.md) | How the multi-engine scanner pipeline works |
| [CLI Handbook](docs/cli-handbook.md) | Full flag reference and usage patterns |
| [Output Artifacts](docs/outputs.md) | Schema and structure of every generated file |

## License

MIT
