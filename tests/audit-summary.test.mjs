import { describe, expect, it } from "vitest";
import { getAuditSummary } from "../src/index.mjs";

describe("getAuditSummary", () => {
  it("computes totals, wcag status and stack metadata", () => {
    const findings = [
      { id: "1", severity: "Critical", fixCode: "x", url: "https://example.com" },
      { id: "2", severity: "Serious", fixCode: "x", url: "https://example.com/a" },
      { id: "3", severity: "Moderate", fixCode: null, url: "https://example.com/b" },
    ];

    const payload = {
      metadata: {
        target_url: "https://example.com",
        projectContext: {
          framework: "nextjs",
          cms: null,
          uiLibraries: ["radix"],
        },
      },
    };

    const summary = getAuditSummary(findings, payload);

    expect(summary.totals).toEqual({ Critical: 1, Serious: 1, Moderate: 1, Minor: 0 });
    expect(summary.wcagStatus).toBe("Fail");
    expect(summary.targetUrl).toBe("https://example.com");
    expect(summary.detectedStack).toEqual({ framework: "nextjs", cms: null, uiLibraries: ["radix"] });
  });

  it("limits quickWins to 3 serious/critical findings with fixes", () => {
    const findings = [
      { id: "1", severity: "Critical", fixCode: "x", url: "https://example.com" },
      { id: "2", severity: "Critical", fixCode: "x", url: "https://example.com" },
      { id: "3", severity: "Serious", fixCode: "x", url: "https://example.com" },
      { id: "4", severity: "Serious", fixCode: "x", url: "https://example.com" },
    ];

    const summary = getAuditSummary(findings, { metadata: {} });
    expect(summary.quickWins).toHaveLength(3);
  });

  it("includes quickWins when fix_code is snake_case", () => {
    const findings = [
      { id: "1", severity: "Serious", fix_code: "<button aria-label='x'></button>", url: "https://example.com" },
    ];
    const summary = getAuditSummary(findings, { metadata: {} });
    expect(summary.quickWins).toHaveLength(1);
  });

  it("handles missing payload metadata safely", () => {
    const summary = getAuditSummary([{ id: "1", severity: "Minor", fixCode: null, url: "https://a.com" }], null);
    expect(summary.targetUrl).toBe("");
    expect(summary.detectedStack).toEqual({ framework: null, cms: null, uiLibraries: [] });
    expect(summary.wcagStatus).toBe("Conditional Pass");
  });
});
