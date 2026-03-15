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
});
