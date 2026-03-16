# a11y Engine

[![npm](https://img.shields.io/npm/v/@diegovelasquezweb/a11y-engine)](https://www.npmjs.com/package/@diegovelasquezweb/a11y-engine)

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
| **Source code scanning** | Static regex analysis of project source for accessibility patterns that runtime engines cannot detect. Works with local paths or remote GitHub repos |
| **Knowledge API** | Exposes WCAG conformance levels, severity definitions, persona profiles, glossary, scanner help, and documentation |

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
  getKnowledge,
} from "@diegovelasquezweb/a11y-engine";
```

#### runAudit

Runs the full scan pipeline: route discovery, scan, merge, analyze, AI enrichment (when configured), and optional source pattern scanning. Returns a payload ready for `getFindings`.

```ts
const payload = await runAudit({
  baseUrl: "https://example.com",
  maxRoutes: 5,
  axeTags: ["wcag2a", "wcag2aa", "best-practice"],
  engines: { axe: true, cdp: true, pa11y: true },
  repoUrl: "https://github.com/owner/repo", // optional, enables source pattern scan and stack detection
  githubToken: process.env.GH_TOKEN,        // optional, required for private repos
  ai: {
    enabled: true,
    apiKey: process.env.ANTHROPIC_API_KEY,
    githubToken: process.env.GH_TOKEN,
    systemPrompt: "Custom prompt...",        // optional, overrides default Claude system prompt
  },
  onProgress: (step, status, extra) => console.log(`${step}: ${status}`, extra),
});
```

See [API Reference](docs/api-reference.md) for options, progress steps, and return types.

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

Returns all accessibility knowledge in a single call: scanner help, persona profiles, concepts, glossary, documentation, conformance levels, WCAG principles, and severity definitions.

```ts
const knowledge = getKnowledge({ locale: "en" });
// knowledge.scanner          → engine and option descriptions
// knowledge.personas         → persona labels and descriptions
// knowledge.concepts         → concept definitions
// knowledge.glossary         → accessibility glossary
// knowledge.docs             → documentation articles
// knowledge.conformanceLevels → A/AA/AAA with axe tag mappings
// knowledge.wcagPrinciples   → the four WCAG principles
// knowledge.severityLevels   → Critical/Serious/Moderate/Minor definitions
```

See [API Reference](docs/api-reference.md) for the full `EngineKnowledge` shape.

## CLI

The package exposes an `a11y-audit` binary for terminal execution. See the [CLI Handbook](docs/cli-handbook.md) for all flags, env vars, and examples.

## Documentation

| Resource | Description |
| :--- | :--- |
| [Architecture](docs/architecture.md) | Multi-engine pipeline, merge logic, and execution model |
| [API Reference](docs/api-reference.md) | Function signatures, options, and return contracts |
| [CLI Handbook](docs/cli-handbook.md) | Full flag reference and usage examples |
| [Output Artifacts](docs/outputs.md) | Schema and structure of every generated file |
| [Engine Manifest](docs/engine-manifest.md) | Current inventory of source modules, assets, and tests |
| [Testing](docs/testing.md) | Test categories, scope, and execution commands |
