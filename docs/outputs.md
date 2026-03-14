# Output Artifacts

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md)

---

## Table of Contents

- [Default output directory](#default-output-directory)
- [a11y-scan-results.json](#a11y-scan-resultsjson)
- [a11y-findings.json](#a11y-findingsjson)
- [remediation.md](#remediationmd)
- [report.html](#reporthtml)
- [report.pdf](#reportpdf)
- [checklist.html](#checklisthtml)
- [Consuming outputs programmatically](#consuming-outputs-programmatically)

---

## Default output directory

All artifacts are written to `.audit/` relative to the package root (`SKILL_ROOT`). When consumed as an npm package, this resolves to the real package path inside `node_modules/`.

```
.audit/
├── a11y-scan-results.json   # raw axe-core scan data
├── a11y-findings.json       # enriched findings (primary data artifact)
├── remediation.md           # AI agent remediation guide
├── report.html              # interactive dashboard (--with-reports)
├── report.pdf               # compliance report (--with-reports)
├── checklist.html           # manual testing checklist (--with-reports)
└── screenshots/             # element screenshots per violation
```

> When integrating the engine as a dependency (e.g. in `a11y-scanner`), use `fs.realpathSync` on the symlink path to resolve the real `.audit/` location — pnpm uses a deep `.pnpm/` directory structure, not the `node_modules/@scope/pkg` symlink.

---

## a11y-scan-results.json

Raw axe-core output per route. Written by `scripts/engine/dom-scanner.mjs`.

```json
{
  "routes": [
    {
      "path": "/",
      "url": "https://example.com/",
      "violations": [...],
      "incomplete": [...],
      "passes": [...],
      "inapplicable": [...]
    }
  ]
}
```

This file is consumed by `analyzer.mjs` and also used by `--affected-only` to determine which routes to re-scan on subsequent runs.

---

## a11y-findings.json

The primary enriched data artifact. Written by `scripts/engine/analyzer.mjs`. This is the file consumed by all report builders.

### Top-level structure

```json
{
  "metadata": { ... },
  "findings": [ ... ]
}
```

### `metadata` fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `scanDate` | `string` (ISO 8601) | Timestamp of when the scan ran |
| `checklist` | `object` | Manual check results if checklist was run |
| `projectContext` | `object` | Auto-detected framework, CMS, and UI libraries |
| `overallAssessment` | `string` | `"Pass"`, `"Conditional Pass"`, or `"Fail"` |
| `passedCriteria` | `string[]` | WCAG criterion IDs with no active violations |
| `outOfScope` | `object[]` | Findings excluded due to guardrails |
| `recommendations` | `object[]` | Grouped fix recommendations by component |
| `testingMethodology` | `object` | Scan scope and methodology summary |
| `fpFiltered` | `number` | Count of findings filtered as likely false positives |
| `deduplicatedCount` | `number` | Count of duplicate findings removed |

### `findings` — per-finding fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Deterministic finding ID (e.g. `A11Y-001`) |
| `rule_id` | `string` | axe-core rule ID (e.g. `color-contrast`) |
| `title` | `string` | Human-readable finding title |
| `severity` | `string` | `Critical`, `Serious`, `Moderate`, or `Minor` |
| `wcag` | `string` | WCAG success criterion (e.g. `1.4.3`) |
| `wcag_criterion_id` | `string` | Full WCAG criterion ID (e.g. `1.4.3`) |
| `wcag_classification` | `string` | `A`, `AA`, `AAA`, or `Best Practice` |
| `area` | `string` | Affected page area (e.g. `Navigation`, `Forms`) |
| `url` | `string` | URL where the violation was found |
| `selector` | `string` | CSS selector for the affected element |
| `primary_selector` | `string` | Most stable selector chosen by the analyzer |
| `impacted_users` | `string` | Disability groups affected |
| `actual` | `string` | Observed violation description |
| `expected` | `string` | What the correct behavior should be |
| `category` | `string` | Violation category (e.g. `Color & Contrast`) |
| `primary_failure_mode` | `string\|null` | Root cause classification |
| `relationship_hint` | `string\|null` | Label/input relationship context |
| `failure_checks` | `object[]` | axe check-level failure details |
| `related_context` | `object[]` | Surrounding DOM context |
| `fix_description` | `string\|null` | Plain-language fix explanation |
| `fix_code` | `string\|null` | Ready-to-apply code snippet |
| `fix_code_lang` | `string` | Language for code block (e.g. `html`, `jsx`) |
| `recommended_fix` | `string` | Link to canonical fix reference (APG, MDN) |
| `mdn` | `string\|null` | MDN documentation URL |
| `effort` | `string\|null` | Fix effort estimate (`low`, `medium`, `high`) |
| `related_rules` | `string[]` | Related axe rule IDs |
| `guardrails` | `object\|null` | Agent scope guardrails for this finding |
| `false_positive_risk` | `string\|null` | Known false positive patterns |
| `fix_difficulty_notes` | `string\|null` | Edge cases and pitfalls for this fix |
| `framework_notes` | `string\|null` | Framework-specific fix guidance |
| `cms_notes` | `string\|null` | CMS-specific fix guidance |
| `check_data` | `object\|null` | Raw axe check data |
| `total_instances` | `number` | Count of affected elements across all pages |
| `evidence` | `object[]` | DOM HTML snippets for each affected element |
| `screenshot_path` | `string\|null` | Path to element screenshot |
| `file_search_pattern` | `string\|null` | Regex/glob pattern to find the source file |
| `managed_by_library` | `string\|null` | UI library managing this element (if any) |
| `ownership_status` | `string` | `confirmed`, `potential`, or `unknown` |
| `ownership_reason` | `string\|null` | Why this ownership status was assigned |
| `primary_source_scope` | `string[]` | Source file paths likely containing the issue |
| `search_strategy` | `string` | Agent search strategy recommendation |
| `component_hint` | `string\|null` | Component name hint for source search |
| `verification_command` | `string\|null` | CLI command to verify fix was applied |
| `verification_command_fallback` | `string\|null` | Fallback verify command |
| `pages_affected` | `number\|null` | Number of pages with this violation |
| `affected_urls` | `string[]\|null` | All URLs where this violation appears |

---

## remediation.md

AI agent-optimized remediation guide. Always generated (even without `--with-reports`). Written to `.audit/remediation.md`.

Content:

- Audit summary header with score, URL, and date
- Per-finding sections with: violation description, DOM evidence, fix description, code snippet, verify command, and WCAG criterion
- "Passed WCAG 2.2 Criteria" section listing clean criteria
- "Source Code Patterns" section (if source scanner ran)
- Component grouping table for batching fixes

The path is printed to stdout on completion as `REMEDIATION_PATH=<path>`.

---

## report.html

Interactive HTML dashboard. Generated only with `--with-reports --output <path>`.

Features:

- Severity-grouped findings with expandable detail cards
- DOM evidence with syntax-highlighted code
- Screenshot thumbnails per finding
- Search and filter by severity, category, and page
- Compliance score gauge with grade label
- Persona impact breakdown (visual, motor, cognitive, etc.)
- Quick wins section (Critical/Serious findings with ready code)

Written to the path specified by `--output`. The path is printed to stdout as `REPORT_PATH=<path>`.

---

## report.pdf

Formal PDF compliance report for stakeholders. Generated alongside `report.html` when `--with-reports` is set.

Sections:

1. Cover page with score, date, and target URL
2. Table of Contents
3. Executive Summary — score, overall assessment, finding counts by severity
4. Legal Risk Summary — applicable regulations based on score tier
5. Methodology — scan scope, tools, and WCAG version
6. Findings Breakdown — severity table and issue summary
7. Recommended Next Steps — dynamically generated from findings

Written to the same directory as `--output` with `.pdf` extension.

---

## checklist.html

Interactive manual testing checklist. Generated alongside `report.html` when `--with-reports` is set.

Contains the 41 WCAG 2.2 AA manual checks that automated tools cannot detect, including:

- Keyboard navigation and focus order
- Screen reader announcements
- Motion and animation
- Zoom and reflow (400%)
- Cognitive load and reading level

Each item is checkable and includes testing instructions. State is not persisted between sessions.

Written to the same directory as `--output` as `checklist.html`.

---

## Consuming outputs programmatically

### Reading `a11y-findings.json` from an integration

```js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Resolve real path (handles pnpm symlinks)
const req = createRequire(import.meta.url);
const auditScript = req.resolve("@diegovelasquezweb/a11y-engine/scripts/audit.mjs");
const engineRoot = path.dirname(path.dirname(auditScript));
const findingsPath = path.join(engineRoot, ".audit", "a11y-findings.json");

const { findings, metadata } = JSON.parse(fs.readFileSync(findingsPath, "utf-8"));
```

> Note: `import.meta.url` may be mangled by bundlers (e.g. Next.js). In that case, use `fs.realpathSync` on the known symlink instead:

```js
const symlinkBase = path.join(process.cwd(), "node_modules", "@diegovelasquezweb", "a11y-engine");
const engineRoot = fs.realpathSync(symlinkBase);
const findingsPath = path.join(engineRoot, ".audit", "a11y-findings.json");
```

### Parsing stdout markers

```bash
OUTPUT=$(node scripts/audit.mjs --base-url https://example.com --with-reports --output ./audit/report.html)
REMEDIATION_PATH=$(echo "$OUTPUT" | grep REMEDIATION_PATH | cut -d= -f2)
REPORT_PATH=$(echo "$OUTPUT" | grep REPORT_PATH | cut -d= -f2)
```
