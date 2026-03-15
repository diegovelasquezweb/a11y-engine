# @diegovelasquezweb/a11y-engine

Accessibility automation engine for web applications. It orchestrates multi engine scanning, stack aware enrichment, and report generation for apps and services through a stable API.

## What it does

| Capability | Description |
| :--- | :--- |
| **Multi engine scanning** | Runs axe-core, CDP accessibility tree checks, and pa11y HTML CodeSniffer against each page, then merges and deduplicates findings across all three engines |
| **Stack detection** | Detects framework and CMS from runtime signals and from project source signals such as package.json and file structure |
| **Fix intelligence** | Enriches each finding with WCAG mapping, fix code snippets, framework and CMS specific notes, UI library ownership hints, effort estimates, and persona impact |
| **Report generation** | Produces HTML dashboard, PDF compliance report, manual testing checklist, and Markdown remediation guide |
| **Source code scanning** | Static regex analysis of project source for accessibility patterns that runtime engines cannot detect |

## Installation

```bash
npm install @diegovelasquezweb/a11y-engine

# Required browsers
npx playwright install chromium        # used by axe-core and CDP checks
npx puppeteer browsers install chrome  # used by pa11y
```

## API Reference

The API is organized in two groups:

- **Core API** builds and summarizes audit data.
- **Output API** renders deliverables from that data.

### Core API

```ts
import {
  runAudit,
  getEnrichedFindings,
  getAuditSummary,
  getPDFReport,
  getHTMLReport,
  getChecklist,
  getRemediationGuide,
  getSourcePatterns,
} from "@diegovelasquezweb/a11y-engine";
```

#### runAudit

Runs the full scan pipeline: crawl, scan with 3 engines, merge, analyze. Returns a payload ready for `getEnrichedFindings`.

```ts
const payload = await runAudit({
  baseUrl: "https://example.com",
  maxRoutes: 5,
  axeTags: ["wcag2a", "wcag2aa", "best-practice"],
  onProgress: (step, status) => console.log(`${step}: ${status}`),
});
```

Progress steps emitted: `page`, `axe`, `cdp`, `pa11y`, `merge`, `intelligence`.

**Options (`RunAuditOptions`)**

| Option | Type | Description |
| :--- | :--- | :--- |
| `baseUrl` | `string` | Target URL to scan |
| `maxRoutes` | `number` | Maximum routes to scan |
| `crawlDepth` | `number` | Route discovery depth |
| `routes` | `string` | Comma separated explicit routes |
| `waitMs` | `number` | Post load wait before scanning |
| `timeoutMs` | `number` | Per page timeout |
| `headless` | `boolean` | Run browser headless or headed |
| `waitUntil` | `string` | Playwright wait strategy |
| `colorScheme` | `string` | Emulated color scheme |
| `viewport` | `{ width: number; height: number }` | Emulated viewport |
| `axeTags` | `string[]` | axe tag filters |
| `onlyRule` | `string` | Run a single rule |
| `excludeSelectors` | `string[]` | Exclude selectors from scan |
| `ignoreFindings` | `string[]` | Drop findings by rule id |
| `framework` | `string` | Force framework context |
| `projectDir` | `string` | Project source path |
| `skipPatterns` | `boolean` | Disable source pattern scan |
| `screenshotsDir` | `string` | Output path for screenshots |
| `onProgress` | `(step, status, extra?) => void` | Progress callback |

#### getEnrichedFindings

Normalizes findings, canonicalizes pa11y rules to axe equivalents, enriches with fix intelligence, infers effort, and sorts by severity.

```ts
const findings = getEnrichedFindings(payload, {
  screenshotUrlBuilder: (path) => `/api/screenshot?path=${encodeURIComponent(path)}`,
});
```

Returns a normalized `EnrichedFinding[]` payload ready for UI rendering and report generation.

**Options (`EnrichmentOptions`)**

| Option | Type | Description |
| :--- | :--- | :--- |
| `screenshotUrlBuilder` | `(rawPath: string) => string` | Transforms screenshot paths into app URLs |

#### getAuditSummary

Computes severity totals, compliance score, WCAG pass/fail status, persona impact groups, quick wins, and detected stack.

```ts
const summary = getAuditSummary(findings, payload);
// summary.score         -> 72
// summary.label         -> "Good"
// summary.wcagStatus    -> "Fail"
// summary.totals        -> { Critical: 1, Serious: 3, Moderate: 5, Minor: 2 }
// summary.personaGroups -> { screenReader: {...}, keyboard: {...}, ... }
// summary.quickWins     -> [top 3 fixable Critical/Serious findings]
// summary.detectedStack -> { framework: "nextjs", cms: null, uiLibraries: [] }
```

### Output API

These functions render final artifacts from scan payload data.

| Function | Returns | Description |
| :--- | :--- | :--- |
| `getPDFReport(payload, options?)` | `{ buffer, contentType }` | Formal A4 PDF compliance report |
| `getHTMLReport(payload, options?)` | `{ html, contentType }` | Interactive HTML audit dashboard |
| `getChecklist(options?)` | `{ html, contentType }` | Manual WCAG testing checklist |
| `getRemediationGuide(payload, options?)` | `{ markdown, contentType }` | Markdown remediation guide |
| `getSourcePatterns(projectDir, options?)` | `{ findings, summary }` | Source code pattern analysis |

**Output API options**

| Function | Options type | Supported options |
| :--- | :--- | :--- |
| `getPDFReport` | `ReportOptions` | `baseUrl?: string`, `target?: string` |
| `getHTMLReport` | `HTMLReportOptions` | `baseUrl?: string`, `target?: string`, `screenshotsDir?: string` |
| `getChecklist` | `Pick<ReportOptions, "baseUrl">` | `baseUrl?: string` |
| `getRemediationGuide` | `RemediationOptions` | `baseUrl?: string`, `target?: string`, `patternFindings?: object \| null` |
| `getSourcePatterns` | `SourcePatternOptions` | `framework?: string`, `onlyPattern?: string` |

For the canonical type definitions, see `src/index.d.mts`.

## Optional CLI

If you need terminal execution, the package also exposes `a11y-audit`.
See the [CLI Handbook](docs/cli-handbook.md) for command flags and examples.

## Documentation

| Resource | Description |
| :--- | :--- |
| [Architecture](docs/architecture.md) | Multi-engine pipeline, merge logic, and execution model |
| [CLI Handbook](docs/cli-handbook.md) | Full flag reference and usage examples |
| [Output Artifacts](docs/outputs.md) | Schema and structure of every generated file |
| [Engine Manifest](docs/engine-manifest.md) | Current inventory of source modules, assets, and tests |
| [Testing](docs/testing.md) | Test categories, scope, and execution commands |
