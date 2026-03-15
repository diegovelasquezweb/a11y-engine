import { describe, expect, it } from "vitest";
import { getChecklist, getHTMLReport, getRemediationGuide, runAudit } from "../src/index.mjs";

const samplePayload = {
  findings: [
    {
      id: "F-1",
      rule_id: "image-alt",
      title: "Image must have alt",
      severity: "Serious",
      wcag: "1.1.1",
      url: "https://example.com",
      selector: "img",
      area: "/",
      fix_code: "<img alt=\"desc\" />",
    },
  ],
  metadata: {
    target_url: "https://example.com",
  },
};

describe("report APIs", () => {
  it("returns checklist html output", async () => {
    const result = await getChecklist({ baseUrl: "https://example.com" });
    expect(result.contentType).toBe("text/html");
    expect(result.html).toContain("Manual Testing Checklist");
    expect(result.html).toContain("example.com");
  });

  it("returns html dashboard output", async () => {
    const result = await getHTMLReport(samplePayload, { baseUrl: "https://example.com" });
    expect(result.contentType).toBe("text/html");
    expect(result.html).toContain("Accessibility Audit Dashboard");
    expect(result.html).toContain("example.com");
  });

  it("returns remediation markdown output", async () => {
    const result = await getRemediationGuide(samplePayload, { baseUrl: "https://example.com" });
    expect(result.contentType).toBe("text/markdown");
    expect(result.markdown.length).toBeGreaterThan(50);
  });

  it("throws when runAudit is called without baseUrl", async () => {
    await expect(runAudit({})).rejects.toThrow("runAudit requires baseUrl");
  });
});
