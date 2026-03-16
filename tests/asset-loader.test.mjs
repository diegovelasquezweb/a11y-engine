import { describe, expect, it } from "vitest";
import { ASSET_PATHS, loadAssetJson } from "../src/core/asset-loader.mjs";

describe("asset loader", () => {
  it("loads all core asset groups", () => {
    const discovery = loadAssetJson(ASSET_PATHS.discovery.crawlerConfig, "crawler-config");
    const scanning = loadAssetJson(ASSET_PATHS.scanning.cdpChecks, "cdp-checks");
    const remediation = loadAssetJson(ASSET_PATHS.remediation.intelligence, "intelligence");
    const reporting = loadAssetJson(ASSET_PATHS.reporting.complianceConfig, "compliance-config");

    expect(discovery).toBeTruthy();
    expect(scanning).toBeTruthy();
    expect(remediation).toBeTruthy();
    expect(reporting).toBeTruthy();
  });

  it("keeps engine path aliases pointing to scanning assets", () => {
    expect(ASSET_PATHS.engine.cdpChecks).toBe(ASSET_PATHS.scanning.cdpChecks);
    expect(ASSET_PATHS.engine.pa11yConfig).toBe(ASSET_PATHS.scanning.pa11yConfig);

    const engineCdp = loadAssetJson(ASSET_PATHS.engine.cdpChecks, "engine-cdp");
    const scanningCdp = loadAssetJson(ASSET_PATHS.scanning.cdpChecks, "scanning-cdp");
    expect(engineCdp).toEqual(scanningCdp);
  });

  it("cdp-checks asset contains all 5 expected rules", () => {
    const cdp = loadAssetJson(ASSET_PATHS.scanning.cdpChecks, "cdp-checks");

    expect(Array.isArray(cdp.rules)).toBe(true);
    expect(cdp.rules.length).toBe(5);

    const ruleIds = cdp.rules.map((r) => r.id);
    expect(ruleIds).toContain("cdp-missing-accessible-name");
    expect(ruleIds).toContain("cdp-aria-hidden-focusable");
    expect(ruleIds).toContain("cdp-autoplay-media");
    expect(ruleIds).toContain("cdp-missing-main-landmark");
    expect(ruleIds).toContain("cdp-missing-skip-link");
  });

  it("cdp-checks dom-eval rules have required fields", () => {
    const cdp = loadAssetJson(ASSET_PATHS.scanning.cdpChecks, "cdp-checks");
    const domEvalRules = cdp.rules.filter((r) => r.condition === "dom-eval");

    expect(domEvalRules.length).toBe(3);

    for (const rule of domEvalRules) {
      expect(rule).toHaveProperty("id");
      expect(rule).toHaveProperty("impact");
      expect(rule).toHaveProperty("tags");
      expect(rule).toHaveProperty("help");
      expect(rule).toHaveProperty("helpUrl");
      expect(rule).toHaveProperty("description");
      expect(rule).toHaveProperty("failureMessage");
      expect(Array.isArray(rule.tags)).toBe(true);
      expect(rule.tags).toContain("cdp-check");
    }
  });

  it("intelligence asset contains cdp check enrichment entries", () => {
    const intelligence = loadAssetJson(ASSET_PATHS.remediation.intelligence, "intelligence");

    expect(intelligence.rules).toHaveProperty("cdp-autoplay-media");
    expect(intelligence.rules).toHaveProperty("cdp-missing-main-landmark");
    expect(intelligence.rules).toHaveProperty("cdp-missing-skip-link");

    for (const key of ["cdp-autoplay-media", "cdp-missing-main-landmark", "cdp-missing-skip-link"]) {
      const rule = intelligence.rules[key];
      expect(rule).toHaveProperty("category");
      expect(rule.fix).toHaveProperty("description");
      expect(rule.fix).toHaveProperty("code");
      expect(rule).toHaveProperty("false_positive_risk");
      expect(rule).toHaveProperty("framework_notes");
    }
  });
});
