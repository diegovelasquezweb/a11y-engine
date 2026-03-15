import { describe, expect, it } from "vitest";
import {
  getFindings,
  getEnrichedFindings,
  getOverview,
  getAuditSummary,
} from "../src/index.mjs";

describe("API aliases", () => {
  it("getFindings matches getEnrichedFindings", () => {
    const payload = {
      findings: [{
        id: "F-1",
        rule_id: "image-alt",
        source: "axe",
        title: "Image alt",
        severity: "Serious",
        wcag: "1.1.1",
        area: "/",
        url: "https://example.com",
        selector: "img",
        actual: "missing alt",
        expected: "has alt",
      }],
      metadata: {},
    };

    expect(getFindings(payload)).toEqual(getEnrichedFindings(payload));
  });

  it("getOverview matches getAuditSummary", () => {
    const findings = [{
      id: "F-1",
      severity: "Serious",
      fixCode: "<img alt=\"x\" />",
      ruleId: "image-alt",
      wcagCriterionId: "1.1.1",
      impactedUsers: "screen reader users",
      url: "https://example.com",
    }];
    const payload = { metadata: { target_url: "https://example.com" } };

    expect(getOverview(findings, payload)).toEqual(getAuditSummary(findings, payload));
  });
});
