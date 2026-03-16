# API Reference

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [Intelligence](intelligence.md) • [API Reference](api-reference.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md) • [Engine Manifest](engine-manifest.md) • [Testing](testing.md)

---

## Table of Contents

- [Installation](#installation)
- [Import](#import)
- [End-to-end example](#end-to-end-example)
- [Core API](#core-api)
  - [runAudit](#runauditoptions)
  - [getFindings](#getfindingsinput-options)
  - [getOverview](#getoverviewfindings-payload)
- [Output API](#output-api)
  - [getPDFReport](#getpdfreportpayload-options)
  - [getHTMLReport](#gethtmlreportpayload-options)
  - [getChecklist](#getchecklistoptions)
  - [getRemediationGuide](#getremediationguidepayload-options)
  - [getSourcePatterns](#getsourcepatternsprojdir-options)
- [Knowledge API](#knowledge-api)
  - [getKnowledge](#getknowledgeoptions)
- [Constants](#constants)
  - [VIEWPORT_PRESETS](#viewport_presets)
  - [DEFAULT_AI_SYSTEM_PROMPT](#default_ai_system_prompt)

---

## Installation

```bash
npm install @diegovelasquezweb/a11y-engine
npx playwright install chromium
npx puppeteer browsers install chrome
```

## Import

All functions are named exports from the package root:

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
  VIEWPORT_PRESETS,
  DEFAULT_AI_SYSTEM_PROMPT,
} from "@diegovelasquezweb/a11y-engine";
```

---

## End-to-end example

```ts
import { runAudit, getFindings, getOverview } from "@diegovelasquezweb/a11y-engine";

// 1. Run the scan
const payload = await runAudit({
  baseUrl: "https://example.com",
  maxRoutes: 5,
  engines: { axe: true, cdp: true, pa11y: true },
  onProgress: (step, status) => console.log(`[${step}] ${status}`),
});

// 2. Get enriched findings
const findings = getFindings(payload);

// 3. Get compliance summary
const { score, label, wcagStatus, totals, quickWins } = getOverview(findings, payload);

console.log(`Score: ${score}/100 (${label})`);
console.log(`WCAG Status: ${wcagStatus}`);
console.log(`Critical: ${totals.Critical}, Serious: ${totals.Serious}`);
```

---

## Core API

### `runAudit(options)`

Runs the full audit pipeline: route discovery → axe/CDP/pa11y scan → merge/dedup → analyzer enrichment → optional source pattern scanning → optional AI enrichment.

Returns a `ScanPayload` object consumed by all other functions.

**Options:**

| Option | Type | Default | Range / Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `baseUrl` | `string` | — | Required | Starting URL including protocol (`https://` or `http://`) |
| `maxRoutes` | `number` | `10` | 1 – 50 | Maximum unique pages to discover and scan |
| `crawlDepth` | `number` | `2` | 1 – 3 | BFS link-follow depth from `baseUrl`. Has no effect when `routes` is set |
| `routes` | `string` | — | CSV paths | Explicit paths to scan (e.g. `"/,/about,/contact"`). Overrides auto-discovery entirely |
| `waitUntil` | `string` | `"domcontentloaded"` | `"domcontentloaded"` \| `"load"` \| `"networkidle"` | Page load strategy. Use `"networkidle"` for SPAs that render after `DOMContentLoaded` |
| `waitMs` | `number` | `2000` | 0 – 10000 | Fixed delay (ms) after page load before engines run |
| `timeoutMs` | `number` | `30000` | 5000 – 120000 | Network timeout per page (ms) |
| `headless` | `boolean` | `true` | — | Set `false` to open a visible browser for debugging |
| `viewport` | `object` | `{ width: 1280, height: 800 }` | width: 320–2560, height: 320–2560 | Browser viewport dimensions in pixels |
| `colorScheme` | `string` | `"light"` | `"light"` \| `"dark"` | Emulates `prefers-color-scheme` media query |
| `engines` | `object` | all `true` | `{ axe?, cdp?, pa11y? }` | Which engines to run. At least one must be enabled |
| `axeTags` | `string[]` | WCAG 2.x A+AA | See below | axe-core rule tag filter. Also determines pa11y standard |
| `onlyRule` | `string` | — | axe rule ID | Run a single axe rule only (e.g. `"color-contrast"`) |
| `ignoreFindings` | `string[]` | — | axe rule IDs | Suppress specific rules from output entirely |
| `excludeSelectors` | `string[]` | — | CSS selectors | Skip elements matching these selectors during axe scan |
| `framework` | `string` | auto-detected | See below | Override framework detection for fix notes and source boundaries |
| `projectDir` | `string` | — | local path | Local project source directory. Enables source pattern scanning and package.json stack detection |
| `repoUrl` | `string` | — | GitHub URL | Remote repo URL. Enables source pattern scanning via GitHub API — no clone required |
| `githubToken` | `string` | — | GitHub PAT | Increases GitHub API rate limit from 60 to 5,000 req/hr. Required for private repos |
| `skipPatterns` | `boolean` | `false` | — | Disable source pattern scanning even when `projectDir` or `repoUrl` is set |
| `screenshotsDir` | `string` | `.audit/screenshots` | dir path | Directory where element screenshots are saved |
| `ai.enabled` | `boolean` | `false` | — | Enable Claude AI enrichment for Critical and Serious findings |
| `ai.apiKey` | `string` | — | Anthropic API key | Required when `ai.enabled` is `true` |
| `ai.githubToken` | `string` | — | GitHub PAT | Used to fetch source files from the repo for AI context |
| `ai.model` | `string` | `"claude-haiku-4-5-20251001"` | Anthropic model ID | Claude model to use |
| `ai.systemPrompt` | `string` | Built-in prompt | — | Overrides the default Claude system prompt for the entire scan |
| `onProgress` | `function` | — | — | Callback fired at each pipeline step |

**`axeTags` common values:**

| Tag | Covers |
| :--- | :--- |
| `wcag2a` | WCAG 2.0 Level A |
| `wcag2aa` | WCAG 2.0 Level AA |
| `wcag21a` | WCAG 2.1 Level A additions |
| `wcag21aa` | WCAG 2.1 Level AA additions |
| `wcag22a` | WCAG 2.2 Level A additions |
| `wcag22aa` | WCAG 2.2 Level AA additions |
| `wcag2aaa` | WCAG 2.0 Level AAA |
| `best-practice` | Non-WCAG best practices |

**Supported `framework` values:** `nextjs`, `gatsby`, `react`, `nuxt`, `vue`, `angular`, `astro`, `svelte`, `remix`, `shopify`, `wordpress`, `drupal`

**`onProgress` callback:**

```ts
onProgress: (step, status, extra) => {
  // step:   "page" | "axe" | "cdp" | "pa11y" | "merge" | "intelligence" | "repo" | "patterns" | "ai"
  // status: "running" | "done" | "error" | "skipped"
  // extra:  { found?: number, merged?: number, ... } — step-specific data
}
```

```ts
const payload = await runAudit({
  baseUrl: "https://example.com",
  maxRoutes: 5,
  engines: { axe: true, cdp: true, pa11y: true },
  repoUrl: "https://github.com/owner/repo",
  githubToken: process.env.GH_TOKEN,
  ai: { enabled: true, apiKey: process.env.ANTHROPIC_API_KEY },
  onProgress: (step, status) => console.log(`[${step}] ${status}`),
});
```

Returns: `Promise<ScanPayload>`

> **`ai_enriched_findings` fast path**: When AI enrichment runs, `getFindings()` uses `payload.ai_enriched_findings` directly instead of re-normalizing the raw findings array.

---

### `getFindings(input, options?)`

Normalizes raw scan results into enriched, UI-ready findings sorted by severity.

```ts
import { getFindings } from "@diegovelasquezweb/a11y-engine";

const findings = getFindings(payload, {
  // Optional: rewrite internal screenshot paths to app URLs
  screenshotUrlBuilder: (rawPath) =>
    `/api/scan/${scanId}/screenshot?path=${encodeURIComponent(rawPath)}`,
});

// findings[0] example:
// {
//   id: "A11Y-001",
//   ruleId: "color-contrast",
//   title: "Elements must meet minimum color contrast ratio thresholds",
//   severity: "Serious",
//   wcag: "1.4.3",
//   selector: ".hero-text",
//   actual: "Element has insufficient color contrast of 2.5:1 ...",
//   expected: "Text contrast ratio must be at least 4.5:1 ...",
//   fixDescription: "Increase the foreground color contrast ...",
//   fixCode: "/* Change #aaa to #767676 */",
//   effort: "low",
//   aiEnhanced: true,            // present when AI ran
//   aiFixDescription: "...",     // Claude-generated (more specific)
//   aiFixCode: "...",            // Claude-generated code snippet
// }
```

Returns: `EnrichedFinding[]`

---

### `getOverview(findings, payload?)`

Computes the compliance score, WCAG status, severity totals, persona groups, and quick wins from enriched findings.

```ts
import { getFindings, getOverview } from "@diegovelasquezweb/a11y-engine";

const findings = getFindings(payload);
const overview = getOverview(findings, payload);

// overview example:
// {
//   score: 72,              // 0–100. Formula: 100 - (Critical×15) - (Serious×5) - (Moderate×2) - (Minor×0.5)
//   label: "Fair",          // "Excellent" (90–100) | "Good" (75–89) | "Fair" (55–74) | "Poor" (35–54) | "Critical" (0–34)
//   wcagStatus: "Fail",     // "Pass" | "Conditional Pass" | "Fail"
//   totals: { Critical: 1, Serious: 3, Moderate: 5, Minor: 2 },
//   personaGroups: {
//     screenReader: { label: "Screen Readers", count: 4, icon: "screenReader" },
//     keyboard:     { label: "Keyboard Only",  count: 2, icon: "keyboard" },
//     vision:       { label: "Color/Low Vision", count: 3, icon: "vision" },
//     cognitive:    { label: "Cognitive/Motor",  count: 1, icon: "cognitive" },
//   },
//   quickWins: [...],       // top 3 Critical/Serious findings with fixCode ready
//   targetUrl: "https://example.com",
//   detectedStack: { framework: "nextjs", cms: null, uiLibraries: ["radix-ui"] },
//   totalFindings: 11,
// }
```

Returns: `AuditSummary`

---

## Output API

### `getPDFReport(payload, options?)`

Generates a formal A4 PDF compliance report.

```ts
import { getPDFReport } from "@diegovelasquezweb/a11y-engine";

const { buffer, contentType } = await getPDFReport(payload, {
  baseUrl: "https://example.com",
  target: "WCAG 2.2 AA",
});

// In a Next.js API route:
return new Response(buffer, { headers: { "Content-Type": contentType } });
```

Returns: `Promise<{ buffer: Buffer, contentType: string }>`

---

### `getHTMLReport(payload, options?)`

Generates an interactive HTML audit dashboard with finding cards, score gauge, and persona breakdown.

```ts
import { getHTMLReport } from "@diegovelasquezweb/a11y-engine";

const { html, contentType } = await getHTMLReport(payload, {
  baseUrl: "https://example.com",
  screenshotsDir: "/path/to/screenshots",
});
```

Returns: `Promise<{ html: string, contentType: string }>`

---

### `getChecklist(options?)`

Generates an interactive HTML manual testing checklist with 41 WCAG checks.

```ts
import { getChecklist } from "@diegovelasquezweb/a11y-engine";

const { html, contentType } = await getChecklist({
  baseUrl: "https://example.com",
});
```

Returns: `Promise<{ html: string, contentType: string }>`

---

### `getRemediationGuide(payload, options?)`

Generates a Markdown remediation guide optimized for AI agents and developers. Includes finding details, fix code, verify commands, and source pattern findings.

```ts
import { getRemediationGuide } from "@diegovelasquezweb/a11y-engine";

const { markdown, contentType } = await getRemediationGuide(payload, {
  baseUrl: "https://example.com",
  patternFindings: payload.patternFindings ?? null,
});

// Write to disk or return as download
```

Returns: `Promise<{ markdown: string, contentType: string }>`

---

### `getSourcePatterns(projectDir, options?)`

Scans a local project directory for source code accessibility patterns that runtime engines cannot detect.

```ts
import { getSourcePatterns } from "@diegovelasquezweb/a11y-engine";

const result = await getSourcePatterns("./", {
  framework: "nextjs",   // optional — scopes scan to framework source dirs
  onlyPattern: "placeholder-only-label", // optional — run a single pattern
});

// result example:
// {
//   findings: [
//     {
//       id: "PAT-a1b2c3",
//       pattern_id: "placeholder-only-label",
//       title: "Input uses placeholder as its only label",
//       severity: "Critical",
//       status: "confirmed",
//       file: "src/components/SearchBar.tsx",
//       line: 12,
//       match: '  <input placeholder="Search..." />',
//       context: "...",
//       fix_description: "Add an aria-label or visible <label> element",
//     }
//   ],
//   summary: { total: 3, confirmed: 2, potential: 1 }
// }
```

Returns: `Promise<SourcePatternResult>`

---

## Knowledge API

### `getKnowledge(options?)`

Returns all accessibility knowledge in a single call. Accepts an optional `{ locale?: string }` option (default: `"en"`).

This is the **only exported Knowledge API function**. The data it returns covers scanner help, persona profiles, concepts, glossary, docs, conformance levels, WCAG principles, and severity definitions — all in one call.

```ts
import { getKnowledge } from "@diegovelasquezweb/a11y-engine";

const knowledge = getKnowledge({ locale: "en" });
```

**Returns:** `EngineKnowledge`

| Field | Type | Description |
| :--- | :--- | :--- |
| `scanner` | `{ title, engines, options }` | Scan option descriptions, allowed values, and engine metadata |
| `personas` | `PersonaReferenceItem[]` | Persona labels, icons, descriptions, and mapped rules |
| `concepts` | `Record<string, ConceptEntry>` | Concept definitions with title, body, and context |
| `glossary` | `GlossaryEntry[]` | Accessibility term definitions |
| `docs` | `KnowledgeDocs` | Documentation articles organized by section and group |
| `conformanceLevels` | `ConformanceLevel[]` | WCAG A/AA/AAA definitions with axe-core tag mappings |
| `wcagPrinciples` | `WcagPrinciple[]` | The four WCAG principles with criterion prefix patterns |
| `severityLevels` | `SeverityLevel[]` | Critical/Serious/Moderate/Minor definitions with ordering |

---

## Constants

### `VIEWPORT_PRESETS`

Ready-made viewport dimensions for common device classes. Useful when building scanner UI option pickers.

```ts
import { VIEWPORT_PRESETS } from "@diegovelasquezweb/a11y-engine";

// VIEWPORT_PRESETS:
// [
//   { label: "Desktop", width: 1280, height: 800 },
//   { label: "Laptop",  width: 1440, height: 900 },
//   { label: "Tablet",  width: 768,  height: 1024 },
//   { label: "Mobile",  width: 375,  height: 812 },
// ]
```

Type: `ViewportPreset[]` — `{ label: string; width: number; height: number }[]`

---

### `DEFAULT_AI_SYSTEM_PROMPT`

The default system prompt passed to Claude for AI enrichment. Exported so consumers can read, log, or extend it when building custom AI workflows.

```ts
import { DEFAULT_AI_SYSTEM_PROMPT } from "@diegovelasquezweb/a11y-engine";

// Override for a specific scan:
await runAudit({
  baseUrl: "https://example.com",
  ai: {
    enabled: true,
    apiKey: process.env.ANTHROPIC_API_KEY,
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT + "\n\nFocus on Vue 3 Composition API patterns.",
  },
});
```

Type: `string`

---

> **Note on `ai_enriched_findings` fast path**: When `getFindings()` receives a payload that contains `ai_enriched_findings` and no `screenshotUrlBuilder` option is provided, it returns `ai_enriched_findings` directly without re-normalizing the raw `findings` array. If a `screenshotUrlBuilder` is provided, normalization always runs so paths can be rewritten.

---

Canonical type source: `src/index.d.mts`
