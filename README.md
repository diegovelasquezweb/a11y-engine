# @diegovelasquezweb/a11y-engine

Accessibility automation engine for web applications. It orchestrates multi engine scanning, stack aware enrichment, and report generation for apps and services through a stable API.

## What it does

| Capability | Description |
| :--- | :--- |
| **Route discovery crawler** | Builds the scan route set using sitemap discovery first, then a same origin multi level crawl with robots filtering, depth control, and max route limits |
| **Multi engine scanning** | Runs axe-core, CDP accessibility tree checks, and pa11y HTML CodeSniffer against each page, then merges and deduplicates findings across all three engines |
| **Stack detection** | Detects framework and CMS from runtime signals and from project source signals such as package.json and file structure |
| **Fix intelligence** | Enriches each finding with WCAG mapping, fix code snippets, framework and CMS specific notes, UI library ownership hints, effort estimates, and persona impact |
| **AI enrichment** | Optional Claude-powered analysis that adds contextual fix suggestions based on detected stack, repo structure, and finding patterns |
| **Report generation** | Produces HTML dashboard, PDF compliance report, manual testing checklist, and Markdown remediation guide |
| **Source code scanning** | Static regex analysis of project source for accessibility patterns that runtime engines cannot detect — works with local paths or remote GitHub repos |

## Installation

```bash
npm install @diegovelasquezweb/a11y-engine

# Required browsers
npx playwright install chromium        # used by axe-core and CDP checks
npx puppeteer browsers install chrome  # used by pa11y
```

## API Reference

### Core API

```ts
import {
  runAudit,
  getFindings,
  getOverview,
  getPDFReport,
  getHTMLReport,
  getChecklist,
  getRemediationGuide,
  getSourcePatterns,
  getScannerHelp,
  getPersonaReference,
  getUiHelp,
  getConformanceLevels,
  getWcagPrinciples,
  getSeverityLevels,
  getKnowledge,
} from "@diegovelasquezweb/a11y-engine";
```

#### runAudit

Runs the full scan pipeline: route discovery, scan, merge, analyze, and optional AI enrichment. Returns a payload ready for `getFindings`.

```ts
const payload = await runAudit({
  baseUrl: "https://example.com",
  maxRoutes: 5,
  axeTags: ["wcag2a", "wcag2aa", "best-practice"],
  engines: { axe: true, cdp: true, pa11y: true },
  onProgress: (step, status, extra) => console.log(`${step}: ${status}`, extra),
});
```

Progress steps emitted: `repo`, `page`, `axe`, `cdp`, `pa11y`, `merge`, `intelligence`, `patterns`, `ai`. Steps are conditional — `repo` only fires when `repoUrl` is set, `patterns` when source scanning is active, and `ai` when AI enrichment is configured.

**`runAudit` options**

| Option | Type | Description |
| :--- | :--- | :--- |
| `baseUrl` | `string` | Target URL to scan |
| `maxRoutes` | `number` | Maximum routes to discover and scan |
| `crawlDepth` | `number` | How many link levels to follow from the starting URL |
| `axeTags` | `string[]` | WCAG tag filters (e.g. `["wcag2a", "wcag2aa"]`) |
| `engines` | `{ axe?, cdp?, pa11y? }` | Enable or disable individual scan engines |
| `waitUntil` | `string` | Page load strategy: `"domcontentloaded"`, `"load"`, or `"networkidle"` |
| `timeoutMs` | `number` | Per-page timeout in milliseconds |
| `viewport` | `{ width, height }` | Browser viewport size |
| `colorScheme` | `string` | Emulated color scheme: `"light"` or `"dark"` |
| `projectDir` | `string` | Local project path for stack detection and source pattern scanning |
| `repoUrl` | `string` | GitHub repo URL for remote stack detection and source pattern scanning |
| `githubToken` | `string` | GitHub token for API access when using `repoUrl` |
| `skipPatterns` | `boolean` | Disable source pattern scanning |
| `ai` | `{ enabled?, apiKey?, githubToken?, model? }` | AI enrichment configuration |
| `onProgress` | `(step, status, extra?) => void` | Progress callback for UI updates |

See [API Reference](docs/api-reference.md) for the full `RunAuditOptions` contract.

#### getFindings

Builds the enriched findings list from the `payload` returned by `runAudit`.

```ts
const findings = getFindings(payload, {
  screenshotUrlBuilder: (path) => `/api/screenshot?path=${encodeURIComponent(path)}`,
});
```

Returns `EnrichedFinding[]` ready for UI rendering and report generation.

**Options (`EnrichmentOptions`)**

| Option | Type | Description |
| :--- | :--- | :--- |
| `screenshotUrlBuilder` | `(rawPath: string) => string` | Rewrites internal screenshot paths into app URLs |

#### getOverview

Computes severity totals, compliance score, WCAG pass/fail status, persona impact groups, quick wins, and detected stack.

```ts
const summary = getOverview(findings, payload);
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

### Knowledge API

These functions expose scanner help content, persona explanations, conformance levels, and UI copy so frontends or agents can render tooltips and guidance from engine-owned data.

| Function | Returns | Description |
| :--- | :--- | :--- |
| `getScannerHelp(options?)` | `{ locale, version, title, engines, options }` | Scanner option and engine help metadata |
| `getPersonaReference(options?)` | `{ locale, version, personas }` | Persona labels, descriptions, and mapping hints |
| `getUiHelp(options?)` | `{ locale, version, tooltips, glossary }` | Shared tooltip copy and glossary entries |
| `getConformanceLevels(options?)` | `{ locale, version, conformanceLevels }` | WCAG conformance level definitions with axe tag mappings |
| `getWcagPrinciples(options?)` | `{ locale, version, wcagPrinciples }` | The four WCAG principles with criterion prefix patterns |
| `getSeverityLevels(options?)` | `{ locale, version, severityLevels }` | Severity level definitions with labels and ordering |
| `getKnowledge(options?)` | Full knowledge pack | Combines all knowledge APIs into a single response for UI or agent flows |

See [API Reference](docs/api-reference.md) for exact options and return types.

## Optional CLI

If you need terminal execution, the package also exposes `a11y-audit`.
See the [CLI Handbook](docs/cli-handbook.md) for command flags and examples.

## Documentation

| Resource | Description |
| :--- | :--- |
| [Architecture](docs/architecture.md) | Multi-engine pipeline, merge logic, and execution model |
| [API Reference](docs/api-reference.md) | Function signatures, options, and return contracts |
| [CLI Handbook](docs/cli-handbook.md) | Full flag reference and usage examples |
| [Output Artifacts](docs/outputs.md) | Schema and structure of every generated file |
| [Engine Manifest](docs/engine-manifest.md) | Current inventory of source modules, assets, and tests |
| [Testing](docs/testing.md) | Test categories, scope, and execution commands |
