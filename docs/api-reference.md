# API Reference

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [API Reference](api-reference.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md) • [Engine Manifest](engine-manifest.md) • [Testing](testing.md)

---

## Core API

### `runAudit(options)`

Runs route discovery, runtime scan, merge, and analyzer enrichment.

`options` (`RunAuditOptions`):

| Option | Type |
| :--- | :--- |
| `baseUrl` | `string` |
| `maxRoutes` | `number` |
| `crawlDepth` | `number` |
| `routes` | `string` |
| `waitMs` | `number` |
| `timeoutMs` | `number` |
| `headless` | `boolean` |
| `waitUntil` | `string` |
| `colorScheme` | `string` |
| `viewport` | `{ width: number; height: number }` |
| `axeTags` | `string[]` |
| `onlyRule` | `string` |
| `excludeSelectors` | `string[]` |
| `ignoreFindings` | `string[]` |
| `framework` | `string` |
| `projectDir` | `string` |
| `skipPatterns` | `boolean` |
| `screenshotsDir` | `string` |
| `onProgress` | `(step: string, status: string, extra?: Record<string, unknown>) => void` |

Returns: `Promise<ScanPayload>`

### `getFindings(input, options?)`

Normalizes and enriches findings and returns sorted enriched findings.

- `input`: `ScanPayload | Finding[] | Record<string, unknown>[]`
- `options` (`EnrichmentOptions`):
  - `screenshotUrlBuilder?: (rawPath: string) => string`

Returns: `EnrichedFinding[]`

### `getOverview(findings, payload?)`

Computes totals, score, WCAG status, persona groups, quick wins, target URL, and detected stack.

- `findings`: `EnrichedFinding[]`
- `payload`: `ScanPayload | null`

Returns: `AuditSummary`

Compatibility aliases:

- `getEnrichedFindings` -> `getFindings`
- `getAuditSummary` -> `getOverview`

## Output API

### `getPDFReport(payload, options?)`

- `payload`: `ScanPayload`
- `options`: `ReportOptions`
  - `baseUrl?: string`
  - `target?: string`

Returns: `Promise<PDFReport>` (`{ buffer, contentType }`)

### `getHTMLReport(payload, options?)`

- `payload`: `ScanPayload`
- `options`: `HTMLReportOptions`
  - `baseUrl?: string`
  - `target?: string`
  - `screenshotsDir?: string`

Returns: `Promise<HTMLReport>` (`{ html, contentType }`)

### `getChecklist(options?)`

- `options`: `Pick<ReportOptions, "baseUrl">`
  - `baseUrl?: string`

Returns: `Promise<ChecklistReport>` (`{ html, contentType }`)

### `getRemediationGuide(payload, options?)`

- `payload`: `ScanPayload & { incomplete_findings?: unknown[] }`
- `options`: `RemediationOptions`
  - `baseUrl?: string`
  - `target?: string`
  - `patternFindings?: Record<string, unknown> | null`

Returns: `Promise<RemediationGuide>` (`{ markdown, contentType }`)

### `getSourcePatterns(projectDir, options?)`

- `projectDir`: `string`
- `options`: `SourcePatternOptions`
  - `framework?: string`
  - `onlyPattern?: string`

Returns: `Promise<SourcePatternResult>`

---

Canonical type source: `src/index.d.mts`
