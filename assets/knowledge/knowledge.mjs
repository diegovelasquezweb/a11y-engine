export default {
  version: "1.0.0",
  locales: {
    en: {
      scanner: {
        title: "Scanner Help",
        engines: [
          {
            id: "axe",
            label: "axe-core",
            description: "Primary WCAG rule engine for rendered DOM violations.",
            coverage: "Broadest WCAG rule coverage with over 90 checks across all four principles. Catches missing labels, contrast failures, landmark structure, and ARIA misuse.",
            speed: "Fast",
            defaultEnabled: true,
          },
          {
            id: "cdp",
            label: "CDP",
            description: "Chrome accessibility tree checks for name/role/focus gaps.",
            coverage: "Inspects the browser accessibility tree directly via Chrome DevTools Protocol. Catches name and role issues that axe misses at the DOM level.",
            speed: "Medium",
            defaultEnabled: true,
          },
          {
            id: "pa11y",
            label: "pa11y",
            description: "HTML CodeSniffer checks to complement axe coverage.",
            coverage: "Runs HTML CodeSniffer against the rendered page. Complements axe with additional HTML-level checks and alternative rule interpretations.",
            speed: "Medium",
            defaultEnabled: true,
          },
        ],
        options: [
          {
            id: "maxRoutes",
            label: "Max routes",
            description: "Limits how many same-origin pages are scanned.",
            defaultValue: 10,
            type: "number",
          },
          {
            id: "crawlDepth",
            label: "Crawl depth",
            description: "Controls how many link levels are explored from the start page.",
            defaultValue: 1,
            type: "number",
          },
          {
            id: "waitUntil",
            label: "Load strategy",
            description: "Navigation readiness event before scanning each page.",
            defaultValue: "domcontentloaded",
            type: "enum",
            allowedValues: [
              {
                value: "domcontentloaded",
                label: "DOM Ready",
                description: "Fires when the initial HTML is parsed. Fastest — use for server-rendered pages.",
              },
              {
                value: "load",
                label: "Page Load",
                description: "Waits for all resources (images, scripts) to finish loading. Good for pages with critical above-the-fold assets.",
              },
              {
                value: "networkidle",
                label: "Network Idle",
                description: "Waits until no network requests for 500ms. Best for SPAs and pages with deferred content loading.",
              },
            ],
          },
          {
            id: "timeoutMs",
            label: "Timeout",
            description: "Maximum time to wait for each page to load before aborting.",
            defaultValue: 30000,
            type: "number",
          },
          {
            id: "viewport",
            label: "Viewport",
            description: "Browser window size used during the audit.",
            defaultValue: "1280x800",
            type: "text",
          },
          {
            id: "colorScheme",
            label: "Color scheme",
            description: "Emulates light or dark mode during the scan.",
            defaultValue: "light",
            type: "enum",
            allowedValues: [
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ],
          },
          {
            id: "axeTags",
            label: "Conformance tags",
            description: "WCAG tag filters sent to axe-core.",
            defaultValue: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"],
            type: "string[]",
          },
        ],
      },
      conformanceLevels: [
        {
          id: "A",
          label: "Level A",
          badge: "Minimum",
          description: "The baseline: essential requirements that remove the most severe barriers.",
          shortDescription: "Minimum baseline",
          hint: "Failing Level A means some users cannot access the content at all.",
          tags: ["wcag2a", "wcag21a", "wcag22a"],
        },
        {
          id: "AA",
          label: "Level AA",
          badge: "Standard",
          description: "The recommended target for most websites — required by most accessibility laws.",
          shortDescription: "Recommended for most websites",
          hint: "Referenced by ADA, Section 508, EN 301 549, and EAA.",
          tags: ["wcag2a", "wcag21a", "wcag22a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
        {
          id: "AAA",
          label: "Level AAA",
          badge: "Enhanced",
          description: "The highest conformance level — not required but beneficial for specialized audiences.",
          shortDescription: "Strictest — not required by most regulations",
          hint: "Full AAA conformance is not recommended as a general policy for entire sites.",
          tags: ["wcag2a", "wcag21a", "wcag22a", "wcag2aa", "wcag21aa", "wcag22aa", "wcag2aaa"],
        },
      ],
      wcagPrinciples: [
        {
          id: "perceivable",
          name: "Perceivable",
          description: "Information and UI components must be presentable to users in ways they can perceive.",
          criterionPrefix: " 1.",
          number: 1,
        },
        {
          id: "operable",
          name: "Operable",
          description: "UI components and navigation must be operable.",
          criterionPrefix: " 2.",
          number: 2,
        },
        {
          id: "understandable",
          name: "Understandable",
          description: "Information and the operation of the UI must be understandable.",
          criterionPrefix: " 3.",
          number: 3,
        },
        {
          id: "robust",
          name: "Robust",
          description: "Content must be robust enough to be interpreted by a wide variety of user agents.",
          criterionPrefix: " 4.",
          number: 4,
        },
      ],
      severityLevels: [
        {
          id: "Critical",
          label: "Critical",
          shortDescription: "Functional blockers",
          description: "Blocks key user tasks with no practical workaround.",
          order: 1,
        },
        {
          id: "Serious",
          label: "Serious",
          shortDescription: "Serious impediments",
          description: "Major barrier with difficult workaround or significant friction.",
          order: 2,
        },
        {
          id: "Moderate",
          label: "Moderate",
          shortDescription: "Significant friction",
          description: "Usability degradation that still allows task completion.",
          order: 3,
        },
        {
          id: "Minor",
          label: "Minor",
          shortDescription: "Minor violations",
          description: "Lower-impact issue that still reduces quality and consistency.",
          order: 4,
        },
      ],
      personas: {
        screenReader: {
          label: "Screen Reader Users",
          description: "People who rely on spoken output and semantic structure.",
        },
        keyboard: {
          label: "Keyboard-Only Users",
          description: "People who navigate and operate controls using the keyboard only.",
        },
        vision: {
          label: "Low Vision Users",
          description: "People affected by low contrast, scaling, and visual clarity issues.",
        },
        cognitive: {
          label: "Cognitive & Learning Users",
          description: "People who benefit from predictable behavior and clear instructions.",
        },
      },
      concepts: {
        score: {
          title: "Compliance Score",
          body: "Weighted score from severity totals. It is a prioritization signal, not legal certification.",
          context: "Based on automated accessibility technical checks.",
        },
        wcagStatus: {
          title: "WCAG Status",
          body: "Pass = no issues. Conditional Pass = only Moderate/Minor. Fail = any Critical/Serious remaining.",
        },
        severityBreakdown: {
          title: "Severity Breakdown",
          body: "Issue counts grouped by user impact and task completion risk.",
        },
        personaImpact: {
          title: "Persona Impact",
          body: "Shows which user groups are most affected by current findings.",
        },
        quickWins: {
          title: "Quick Wins",
          body: "Top Critical/Serious findings that already include concrete fix code.",
          context: "High-priority issues with ready-to-use code fixes for immediate remediation.",
        },
        findingsFilter: {
          title: "Findings Filter",
          body: "Filter findings by severity or WCAG principle to focus remediation.",
        },
      },
      docs: {
        sections: [
          {
            id: "understanding-wcag",
            heading: "Understanding WCAG",
            groups: [
              {
                id: "wcag-versions",
                label: "WCAG Versions",
                articles: [
                  {
                    id: "wcag-2-0",
                    title: "WCAG 2.0",
                    badge: "2008",
                    summary: "The original W3C recommendation that established the foundation for web accessibility.",
                    body: "Introduced the four principles (Perceivable, Operable, Understandable, Robust) and three conformance levels (A, AA, AAA). Covers core requirements like text alternatives, keyboard access, color contrast, and form labels. Still widely referenced in legal frameworks worldwide.",
                  },
                  {
                    id: "wcag-2-1",
                    title: "WCAG 2.1",
                    badge: "2018",
                    summary: "Extended 2.0 with 17 new success criteria for mobile, low vision, and cognitive disabilities.",
                    body: "Added criteria for touch targets (2.5.5), text spacing (1.4.12), content reflow (1.4.10), orientation (1.3.4), and input purpose (1.3.5). Required by the European Accessibility Act (EAA) and referenced in updated ADA guidance. All 2.0 criteria remain \u2014 2.1 is a superset.",
                  },
                  {
                    id: "wcag-2-2",
                    title: "WCAG 2.2",
                    badge: "2023",
                    summary: "The latest version, adding 9 new criteria focused on cognitive accessibility and consistent help.",
                    body: "Key additions include consistent help (3.2.6), accessible authentication (3.3.8), dragging movements (2.5.7), and focus appearance (2.4.11/2.4.12). Removed criterion 4.1.1 (Parsing) as it\u2019s now handled by modern browsers. Supersedes both 2.0 and 2.1 \u2014 all prior criteria are included.",
                  },
                ],
              },
              {
                id: "conformance-levels",
                label: "Conformance Levels",
                articles: [
                  {
                    id: "level-a",
                    title: "Level A",
                    badge: "Minimum",
                    summary: "The baseline: essential requirements that remove the most severe barriers.",
                    body: "Covers fundamentals like non-text content alternatives (1.1.1), keyboard operability (2.1.1), page titles (2.4.2), and language of the page (3.1.1). Failing Level A means some users cannot access the content at all. Every site should meet Level A at minimum.",
                  },
                  {
                    id: "level-aa",
                    title: "Level AA",
                    badge: "Standard",
                    summary: "The recommended target for most websites \u2014 required by most accessibility laws.",
                    body: "Includes all Level A criteria plus requirements for color contrast (1.4.3 \u2014 4.5:1 ratio), resize text (1.4.4), focus visible (2.4.7), error suggestion (3.3.3), and consistent navigation (3.2.3). Referenced by ADA, Section 508, EN 301 549, and EAA. This is the standard the scanner defaults to.",
                  },
                  {
                    id: "level-aaa",
                    title: "Level AAA",
                    badge: "Enhanced",
                    summary: "The highest conformance level \u2014 not required but beneficial for specialized audiences.",
                    body: "Adds stricter contrast (1.4.6 \u2014 7:1 ratio), sign language for audio (1.2.6), extended audio description (1.2.7), and reading level (3.1.5). Full AAA conformance is not recommended as a general policy because some criteria cannot be satisfied for all content types. Useful for targeted sections like education or government services.",
                  },
                ],
              },
            ],
          },
          {
            id: "how-it-works",
            heading: "How It Works",
            articles: [
              {
                id: "load-render",
                title: "Load & Render",
                icon: "globe",
                summary: "The scanner loads your URL in a real browser (Chromium) and waits for full render.",
                body: "A headless Chromium instance navigates to the target URL, executes JavaScript, waits for network idle, and captures the fully rendered DOM. This ensures dynamic content (SPAs, lazy-loaded elements) is included in the analysis.",
              },
              {
                id: "multi-engine-scan",
                title: "Multi-Engine Scan",
                icon: "cpu",
                summary: "Multiple engines (axe-core, CDP, pa11y) run in parallel for broader coverage.",
                body: "Each engine uses different detection techniques: axe-core runs DOM-based rule checks, CDP inspects accessibility tree properties via Chrome DevTools Protocol, and pa11y validates rendered HTML against WCAG criteria. Combined, they catch issues that any single engine would miss.",
              },
              {
                id: "merge-deduplicate",
                title: "Merge & Deduplicate",
                icon: "git-merge",
                summary: "Findings from all engines are normalized, deduplicated, and scored by severity.",
                body: "Results are merged by selector + rule ID to eliminate duplicates. Each finding is mapped to its WCAG criterion, assigned a severity level (Critical/Serious/Moderate/Minor), and enriched with persona impact data showing which disability groups are affected.",
              },
              {
                id: "ai-enrichment",
                title: "AI Enrichment",
                icon: "sparkles",
                summary: "Each issue gets code fixes, MDN references, and framework-specific guidance.",
                body: "The intelligence layer generates actionable fix descriptions, ready-to-use code snippets, links to relevant MDN documentation, and effort estimates. Quick Wins are identified as high-impact issues with low-effort fixes for immediate remediation.",
              },
            ],
          },
        ],
      },
      glossary: [
        {
          term: "Critical",
          definition: "Blocks key user tasks with no practical workaround.",
        },
        {
          term: "Serious",
          definition: "Major barrier with difficult workaround or significant friction.",
        },
        {
          term: "Moderate",
          definition: "Usability degradation that still allows task completion.",
        },
        {
          term: "Minor",
          definition: "Lower-impact issue that still reduces quality and consistency.",
        },
        {
          term: "Conditional Pass",
          definition: "No Critical/Serious findings remain, but Moderate/Minor issues still exist.",
        },
      ],
    },
  },
};
