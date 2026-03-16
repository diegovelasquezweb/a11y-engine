# API Reference

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [Intelligence](intelligence.md) • [API Reference](api-reference.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md) • [Engine Manifest](engine-manifest.md) • [Testing](testing.md)

---

## Core API

### `runAudit(options)`

Runs route discovery, runtime scan, merge, analyzer enrichment, and optional AI enrichment. Supports local project paths or remote GitHub repos for stack detection and source pattern scanning.

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
| `repoUrl` | `string` |
| `githubToken` | `string` |
| `skipPatterns` | `boolean` |
| `screenshotsDir` | `string` |
| `engines` | `{ axe?: boolean; cdp?: boolean; pa11y?: boolean }` |
| `ai` | `{ enabled?: boolean; apiKey?: string; githubToken?: string; model?: string; systemPrompt?: string }` — `systemPrompt` overrides the default Claude prompt when set |
| `onProgress` | `(step: string, status: string, extra?: Record<string, unknown>) => void` |

Progress steps emitted via `onProgress`:

| Step | When |
| :--- | :--- |
| `page` | Always — page load |
| `axe` | Always — axe-core scan |
| `cdp` | Always — CDP accessibility tree check |
| `pa11y` | Always — pa11y HTML CodeSniffer scan |
| `merge` | Always — finding deduplication |
| `intelligence` | Always — enrichment and WCAG mapping |
| `repo` | When `repoUrl` is set |
| `patterns` | When source scanning is active |
| `ai` | When AI enrichment is configured |

Returns: `Promise<ScanPayload>`

> **`ai_enriched_findings` fast path**: When AI enrichment runs, the engine appends `ai_enriched_findings` to the payload. `getFindings()` checks for this field first — if present, it returns the already-enriched findings directly without re-normalizing the raw `findings` array.

### `getFindings(input, options?)`

Normalizes and enriches findings and returns sorted enriched findings.

- `input`: `ScanPayload` from `runAudit`
- `options` (`EnrichmentOptions`):
  - `screenshotUrlBuilder?: (rawPath: string) => string`

Returns: `EnrichedFinding[]`

### `getOverview(findings, payload?)`

Computes totals, score, WCAG status, persona groups, quick wins, target URL, and detected stack.

- `findings`: `EnrichedFinding[]`
- `payload`: `ScanPayload | null`

Returns: `AuditSummary`

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

## Knowledge API

### `getScannerHelp(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `ScannerHelp` (`{ locale, version, title, engines, options }`)

### `getPersonaReference(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `PersonaReference` (`{ locale, version, personas }`)

### `getUiHelp(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `UiHelp` (`{ locale, version, concepts, glossary }`)

### `getConformanceLevels(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `ConformanceLevelsResult` (`{ locale, version, conformanceLevels }`)

### `getWcagPrinciples(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `WcagPrinciplesResult` (`{ locale, version, wcagPrinciples }`)

### `getSeverityLevels(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `SeverityLevelsResult` (`{ locale, version, severityLevels }`)

### `getKnowledge(options?)`

- `options`: `KnowledgeOptions`
  - `locale?: string`

Returns: `EngineKnowledge` (`{ locale, version, scanner, personas, concepts, glossary, docs, conformanceLevels, wcagPrinciples, severityLevels }`)

---

Canonical type source: `src/index.d.mts`
