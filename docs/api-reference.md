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
  - [PM_AI_SYSTEM_PROMPT](#pm_ai_system_prompt)

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
  PM_AI_SYSTEM_PROMPT,
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
| `axeTags` | `string[]` | WCAG 2.x A+AA | See below | axe-core rule tag filter. Also determines pa11y standard. Add `"best-practice"` and/or `"ACT"` to include non-WCAG best practices and W3C ACT rules (opt-in, not included by default) |
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
| `ai.audience` | `string` | `"dev"` | `"dev"` \| `"pm"` | Controls the AI enrichment tone. `"dev"` generates code-level fixes; `"pm"` generates business impact summaries |
| `clearCache` | `boolean` | `false` | — | Clear browser cache before each page navigation via CDP `Network.clearBrowserCache`. Ensures fresh results on repeated scans of the same domain |
| `serverMode` | `boolean` | `false` | — | Enable server/EC2/Docker Chrome launch flags: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--no-zygote`, `--disable-accelerated-2d-canvas`. Use in CI, Docker, or EC2 environments |
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
| `best-practice` | Non-WCAG best practices (opt-in) |
| `ACT` | W3C Accessibility Conformance Testing rules (opt-in) |

**Supported `framework` values:** `nextjs`, `gatsby`, `react`, `nuxt`, `vue`, `angular`, `astro`, `svelte`, `remix`, `shopify`, `wordpress`, `drupal`

**CDP checks:**

The `cdp` engine runs 5 checks split across two mechanisms:

| Check ID | Mechanism | Impact | WCAG |
| :--- | :--- | :--- | :--- |
| `cdp-missing-accessible-name` | Accessibility tree | Serious | 4.1.2 A |
| `cdp-aria-hidden-focusable` | Accessibility tree | Serious | 4.1.2 A |
| `cdp-autoplay-media` | `page.evaluate()` | Serious | 1.4.2, 2.2.2 A |
| `cdp-missing-main-landmark` | `page.evaluate()` | Moderate | 1.3.1 A |
| `cdp-missing-skip-link` | `page.evaluate()` | Moderate | 2.4.1 A |

All 5 checks have intelligence enrichment entries (fix description, fix code, framework notes, CMS notes).

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

**`ScanPayload` shape:**

```ts
{
  findings: RawFinding[],                // Raw findings from axe/CDP/pa11y merge
  metadata: {
    target_url: string,                  // The baseUrl that was scanned
    scanned_at: string,                  // ISO 8601 timestamp
    engines: {                           // Which engines actually ran
      axe: boolean,
      cdp: boolean,
      pa11y: boolean,
    },
    projectContext: {                     // Auto-detected or overridden stack
      framework: string | null,          // "nextjs" | "react" | "vue" | etc.
      cms: string | null,               // "wordpress" | "shopify" | etc.
      uiLibraries: string[],            // ["radix-ui", "tailwindcss", ...]
    },
    routes_scanned: number,              // How many pages were actually scanned
    discovery_method: string,            // "crawl" | "explicit"
    passesCount: number,                 // Unique axe rules that passed (deduplicated across routes)
    incompleteCount: number,             // Total axe incomplete results across routes (needs manual review)
    inapplicableCount: number,           // Unique axe rules that were inapplicable (deduplicated across routes)
  },
  incomplete_findings?: RawFinding[],    // axe "incomplete" results (needs-review)
  patternFindings?: {                    // Only present if projectDir/repoUrl + !skipPatterns
    generated_at: string,
    project_dir: string,                 // Local path or repo URL
    findings: SourcePatternFinding[],
    summary: {
      total: number,
      confirmed: number,
      potential: number,
    },
  },
  ai_enriched_findings?: EnrichedFinding[], // Only present if ai.enabled + ai.apiKey
}
```

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

**`EnrichedFinding` shape:**

```ts
{
  // Identity
  id: string,                            // "A11Y-001", "A11Y-002", ...
  ruleId: string,                        // Canonical rule ID (e.g. "color-contrast")
  source: string,                        // "axe" | "cdp" | "pa11y"
  sourceRuleId: string | null,           // Original engine rule ID before canonicalization

  // Classification
  title: string,                         // Human-readable issue title
  severity: string,                      // "Critical" | "Serious" | "Moderate" | "Minor"
  category: string | null,               // "color", "forms", "structure", "aria", ...
  wcag: string,                          // WCAG criterion (e.g. "1.4.3")
  wcagCriterionId: string | null,        // Full criterion ID (e.g. "1.4.3")
  wcagClassification: string | null,     // "A" | "AA" | "AAA" | "Best Practice"

  // Location
  area: string,                          // Page path (e.g. "/about")
  url: string,                           // Full page URL
  selector: string,                      // CSS selector of the violating element
  primarySelector: string,               // Preferred selector for targeting

  // Problem description
  actual: string,                        // What the engine found
  expected: string,                      // What WCAG requires
  impactedUsers: string,                 // "Screen reader users", "Keyboard users", etc.
  primaryFailureMode: string | null,     // "missing-label" | "low-contrast" | ...
  relationshipHint: string | null,       // How this relates to other findings

  // Evidence
  evidence: object[],                    // Raw evidence from the engine
  failureChecks: object[],              // axe check details
  relatedContext: object[],             // Related DOM elements
  totalInstances: number | null,         // How many elements are affected
  pagesAffected: number | null,          // How many pages have this issue
  affectedUrls: string[] | null,         // Specific URLs affected

  // Fix guidance
  fixDescription: string | null,         // Human-readable fix explanation
  fixCode: string | null,               // Code snippet to fix the issue
  fixCodeLang: string,                   // "html" | "css" | "jsx" | ...
  recommendedFix: string,               // Short fix summary
  mdn: string | null,                   // MDN reference URL
  effort: string,                        // "low" (has fixCode) | "high" (no fixCode)
  fixDifficultyNotes: object | null,     // Detailed difficulty breakdown

  // Framework / CMS context
  frameworkNotes: string | null,         // Framework-specific fix guidance
  cmsNotes: string | null,              // CMS-specific fix guidance
  managedByLibrary: string | null,       // If the element is from a 3rd-party lib
  componentHint: string | null,          // Likely component name
  fileSearchPattern: string | null,      // Glob pattern to find source file

  // Ownership & search
  ownershipStatus: string,               // "own" | "third-party" | "unknown"
  ownershipReason: string | null,        // Why it was classified that way
  primarySourceScope: string[],          // Directories to search for source
  searchStrategy: string,                // "verify_ownership_before_search" | ...

  // Verification
  verificationCommand: string | null,    // CLI command to verify the fix
  verificationCommandFallback: string | null,
  screenshotPath: string | null,         // Path or URL to element screenshot

  // Metadata
  relatedRules: string[],               // Related axe rule IDs
  falsePositiveRisk: string | null,      // "low" | "medium" | "high"
  guardrails: object | null,             // Guardrail metadata from the engine
  checkData: object | null,              // Raw check data from the engine

  // PM audience fields (always present from intelligence DB)
  pmSummary: string | null,              // One-line business impact for PMs
  pmImpact: string | null,              // Business/legal/UX consequences
  pmEffort: string | null,              // "quick-win" | "medium" | "strategic"

  // AI enrichment (only when ai.enabled ran)
  aiEnhanced?: boolean,                  // true when AI enriched this finding
  aiFixDescription?: string,             // Claude-generated fix explanation
  aiFixCode?: string,                    // Claude-generated code snippet
}
```

---

### `getOverview(findings, payload?)`

Computes the compliance score, WCAG status, severity totals, persona groups, and quick wins from enriched findings.

```ts
import { getFindings, getOverview } from "@diegovelasquezweb/a11y-engine";

const findings = getFindings(payload);
const overview = getOverview(findings, payload);
```

Returns: `AuditSummary`

**`AuditSummary` shape:**

```ts
{
  score: number,                         // 0–100. Formula: 100 - (Critical×15) - (Serious×5) - (Moderate×2) - (Minor×0.5)
  label: string,                         // "Excellent" (90–100) | "Good" (75–89) | "Fair" (55–74) | "Poor" (35–54) | "Critical" (0–34)
  wcagStatus: string,                    // "Pass" | "Conditional Pass" | "Fail"
  totals: {
    Critical: number,
    Serious: number,
    Moderate: number,
    Minor: number,
  },
  personaGroups: Record<string, {        // Keyed by persona ID
    label: string,                       // "Screen Readers", "Keyboard Only", ...
    count: number,                       // Findings affecting this persona
    icon: string,                        // Same as persona ID
  }>,
  quickWins: EnrichedFinding[],          // Top 3 Critical/Serious findings with fixCode
  targetUrl: string,                     // The scanned URL
  detectedStack: {
    framework: string | null,            // "nextjs" | "react" | etc.
    cms: string | null,                  // "wordpress" | "shopify" | etc.
    uiLibraries: string[],              // ["radix-ui", "tailwindcss", ...]
  },
  totalFindings: number,                 // Total enriched findings count
}
```

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
```

Returns: `Promise<PDFReportResult>`

**`PDFReportResult` shape:**

```ts
{
  buffer: Buffer,                        // Raw PDF binary data
  contentType: "application/pdf",        // MIME type for response headers
}
```

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

Returns: `Promise<HTMLReportResult>`

**`HTMLReportResult` shape:**

```ts
{
  html: string,                          // Self-contained HTML document string
  contentType: "text/html",              // MIME type for response headers
}
```

---

### `getChecklist(options?)`

Generates an interactive HTML manual testing checklist with 41 WCAG checks.

```ts
import { getChecklist } from "@diegovelasquezweb/a11y-engine";

const { html, contentType } = await getChecklist({
  baseUrl: "https://example.com",
});
```

Returns: `Promise<ChecklistResult>`

**`ChecklistResult` shape:**

```ts
{
  html: string,                          // Self-contained HTML with interactive checklist
  contentType: "text/html",              // MIME type for response headers
}
```

---

### `getRemediationGuide(payload, options?)`

Generates a Markdown remediation guide optimized for AI agents and developers. Includes finding details, fix code, verify commands, and source pattern findings.

```ts
import { getRemediationGuide } from "@diegovelasquezweb/a11y-engine";

const { markdown, contentType } = await getRemediationGuide(payload, {
  baseUrl: "https://example.com",
  patternFindings: payload.patternFindings ?? null,
});
```

Returns: `Promise<RemediationGuideResult>`

**`RemediationGuideResult` shape:**

```ts
{
  markdown: string,                      // Full Markdown document with remediation roadmap
  contentType: "text/markdown",          // MIME type for response headers
}
```

---

### `getSourcePatterns(projectDir, options?)`

Scans a local project directory for source code accessibility patterns that runtime engines cannot detect.

```ts
import { getSourcePatterns } from "@diegovelasquezweb/a11y-engine";

const result = await getSourcePatterns("./", {
  framework: "nextjs",   // optional — scopes scan to framework source dirs
  onlyPattern: "placeholder-only-label", // optional — run a single pattern
});
```

Returns: `Promise<SourcePatternResult>`

**`SourcePatternResult` shape:**

```ts
{
  findings: {
    id: string,                          // "PAT-a1b2c3" — unique pattern finding ID
    pattern_id: string,                  // Pattern definition ID (e.g. "placeholder-only-label")
    title: string,                       // Human-readable issue title
    severity: string,                    // "Critical" | "Serious" | "Moderate" | "Minor"
    status: string,                      // "confirmed" | "potential"
    file: string,                        // Relative file path (e.g. "src/components/SearchBar.tsx")
    line: number,                        // Line number where the pattern was found
    match: string,                       // The matching source code line
    context: string,                     // Surrounding code for context
    fix_description: string,             // How to fix the pattern
  }[],
  summary: {
    total: number,                       // Total findings found
    confirmed: number,                   // Definite accessibility issues
    potential: number,                   // Likely issues that need manual review
  },
}
```

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

**`EngineKnowledge` shape:**

```ts
{
  locale: string,                        // "en"
  version: string,                       // "1.0.0"

  scanner: {
    title: string,                       // "Scanner Help"
    engines: {                           // Engine descriptions
      id: string,                        // "axe" | "cdp" | "pa11y"
      label: string,
      description: string,
    }[],
    options: {                           // CLI/API option descriptions
      name: string,                      // "maxRoutes"
      type: string,                      // "number" | "string" | "boolean"
      default: string | number | boolean,
      description: string,
      values?: string[],                 // Allowed values if enum-like
    }[],
  },

  personas: {                            // Disability persona profiles
    id: string,                          // "screenReader" | "keyboard" | "vision" | "cognitive"
    icon: string,                        // Same as id, used for icon lookup
    label: string,                       // "Screen Readers"
    description: string,                 // Explanation of the persona
    keywords: string[],                  // Keywords for matching findings
    mappedRules: string[],               // axe rule IDs mapped to this persona
  }[],

  concepts: Record<string, {             // Concept definitions keyed by ID
    title: string,
    body: string,
    context?: string,                    // When/where this concept applies
  }>,

  glossary: {                            // Accessibility term definitions
    term: string,
    definition: string,
  }[],

  docs: {                                // Documentation articles
    sections: {
      id: string,
      title: string,
      groups: {
        id: string,
        title: string,
        articles: {
          id: string,
          title: string,
          body: string,
        }[],
      }[],
    }[],
  },

  conformanceLevels: {                   // WCAG A/AA/AAA definitions
    level: string,                       // "A" | "AA" | "AAA"
    label: string,
    description: string,
    axeTags: string[],                   // ["wcag2a", "wcag21a", "wcag22a"]
  }[],

  wcagPrinciples: {                      // The four WCAG principles
    id: string,                          // "perceivable" | "operable" | "understandable" | "robust"
    label: string,
    description: string,
    criterionPrefix: string,             // "1." | "2." | "3." | "4."
  }[],

  severityLevels: {                      // Severity definitions
    level: string,                       // "Critical" | "Serious" | "Moderate" | "Minor"
    label: string,
    description: string,
    order: number,                       // 1 (Critical) – 4 (Minor)
  }[],
}
```

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

### `PM_AI_SYSTEM_PROMPT`

The system prompt used for PM-audience AI enrichment. Instructs Claude to generate business-oriented summaries instead of developer-focused fixes. Used automatically when `ai.audience` is `"pm"`.

```ts
import { PM_AI_SYSTEM_PROMPT } from "@diegovelasquezweb/a11y-engine";
```

Type: `string`

---

> **Note on `ai_enriched_findings` fast path**: When `getFindings()` receives a payload that contains `ai_enriched_findings` and no `screenshotUrlBuilder` option is provided, it returns `ai_enriched_findings` directly without re-normalizing the raw `findings` array. If a `screenshotUrlBuilder` is provided, normalization always runs so paths can be rewritten.

---

Canonical type source: `src/index.d.mts`
