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
            defaultEnabled: true,
          },
          {
            id: "cdp",
            label: "CDP",
            description: "Chrome accessibility tree checks for name/role/focus gaps.",
            defaultEnabled: true,
          },
          {
            id: "pa11y",
            label: "pa11y",
            description: "HTML CodeSniffer checks to complement axe coverage.",
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
            defaultValue: 2,
            type: "number",
          },
          {
            id: "waitUntil",
            label: "Load strategy",
            description: "Navigation readiness event before scanning each page.",
            defaultValue: "domcontentloaded",
            type: "enum",
            allowedValues: ["domcontentloaded", "load", "networkidle"],
          },
          {
            id: "timeoutMs",
            label: "Timeout",
            description: "Maximum navigation wait time per route in milliseconds.",
            defaultValue: 30000,
            type: "number",
          },
          {
            id: "viewport",
            label: "Viewport",
            description: "Browser viewport used during scan emulation.",
            defaultValue: "1280x800",
            type: "text",
          },
          {
            id: "colorScheme",
            label: "Color scheme",
            description: "Emulated light or dark color-scheme preference.",
            defaultValue: "light",
            type: "enum",
            allowedValues: ["light", "dark"],
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
      tooltips: {
        scoreGauge: {
          title: "Compliance Score",
          body: "Weighted score from severity totals. It is a prioritization signal, not legal certification.",
        },
        wcagStatus: {
          title: "WCAG Status",
          body: "Pass = no issues. Conditional Pass = only Moderate/Minor. Fail = any Critical/Serious remaining.",
        },
        severityCards: {
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
        },
        findingsFilter: {
          title: "Findings Filter",
          body: "Filter findings by severity or WCAG principle to focus remediation.",
        },
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
