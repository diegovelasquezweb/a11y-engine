# @diegovelasquezweb/a11y-engine

WCAG 2.2 AA accessibility audit engine. Combines three scanning engines (axe-core, Chrome DevTools Protocol, and pa11y), merges and deduplicates findings, enriches results with fix intelligence, detects the site's tech stack from the live DOM, and generates structured reports.

## What it does

| Capability | Description |
| :--- | :--- |
| **Multi-engine scanning** | Runs axe-core, CDP accessibility tree checks, and pa11y (HTML CodeSniffer) against each page, then merges and deduplicates findings across all three engines |
| **Fix intelligence** | Enriches each finding with WCAG mapping, fix code snippets, framework-specific notes, effort estimates, and persona impact |
| **Stack detection** | Detects framework and CMS from the live page DOM (globals, scripts, meta tags) and from project source when available |
| **Report generation** | Produces HTML dashboard, PDF compliance report, manual testing checklist, and Markdown remediation guide |
| **Source code scanning** | Static regex analysis of project source for accessibility patterns that runtime engines cannot detect |

## Installation

```bash
npm install @diegovelasquezweb/a11y-engine

# Required browsers
npx playwright install chromium        # used by axe-core and CDP checks
npx puppeteer browsers install chrome  # used by pa11y
```

If Puppeteer Chrome is missing, pa11y fails silently and the scan continues with axe-core + CDP.

## Usage

The engine works two ways: as a **programmatic API** for applications, and as a **CLI** for direct execution.

### Programmatic API

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

#### getEnrichedFindings

Normalizes findings, canonicalizes pa11y rules to axe equivalents, enriches with fix intelligence, infers effort, and sorts by severity.

```ts
const findings = getEnrichedFindings(payload, {
  screenshotUrlBuilder: (path) => `/api/screenshot?path=${encodeURIComponent(path)}`,
});
```

Returns `EnrichedFinding[]` with both snake_case and camelCase fields.

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

#### Report functions

| Function | Returns | Description |
| :--- | :--- | :--- |
| `getPDFReport(payload, options?)` | `{ buffer, contentType }` | Formal A4 PDF compliance report |
| `getHTMLReport(payload, options?)` | `{ html, contentType }` | Interactive HTML audit dashboard |
| `getChecklist(options?)` | `{ html, contentType }` | Manual WCAG testing checklist |
| `getRemediationGuide(payload, options?)` | `{ markdown, contentType }` | Markdown remediation guide |
| `getSourcePatterns(projectDir, options?)` | `{ findings, summary }` | Source code pattern analysis |

### CLI

```bash
# Minimal scan
npx a11y-audit --base-url https://example.com

# Full audit with reports
npx a11y-audit --base-url https://example.com --with-reports --output ./audit/report.html

# Scan with source code intelligence
npx a11y-audit --base-url http://localhost:3000 --project-dir . --with-reports --output ./audit/report.html
```

See the [CLI Handbook](docs/cli-handbook.md) for the full flag reference.

## Project structure

```
src/
  index.mjs              Public API (8 exported functions)
  index.d.mts            TypeScript declarations
  cli/                   CLI adapter (calls public API)
  core/                  Logger, utilities, asset loader
  pipeline/              DOM scanner (axe + CDP + pa11y + merge)
  enrichment/            Finding analyzer and fix intelligence
  reports/               HTML, PDF, checklist, and markdown builders
  source-patterns/       Static source code pattern scanner

assets/
  discovery/             Crawler config, stack detection rules
  scanning/              CDP check definitions, pa11y config
  remediation/           Fix intelligence, code patterns, guardrails
  reporting/             Compliance config, WCAG reference, manual checks

tests/                   Vitest suite (unit + integration)
```

## Documentation

| Resource | Description |
| :--- | :--- |
| [Architecture](docs/architecture.md) | Multi-engine pipeline, merge logic, and execution model |
| [CLI Handbook](docs/cli-handbook.md) | Full flag reference and usage examples |
| [Output Artifacts](docs/outputs.md) | Schema and structure of every generated file |

## License

MIT
