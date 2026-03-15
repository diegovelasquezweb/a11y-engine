/**
 * @file asset-loader.mjs
 * @description Centralized asset loading for the a11y engine.
 * Assets are imported as ES modules — no filesystem reads required.
 * This ensures bundlers (Turbopack, Webpack) can trace them automatically.
 */

import crawlerConfig from "../../assets/discovery/crawler-config.mjs";
import stackDetection from "../../assets/discovery/stack-detection.mjs";
import cdpChecks from "../../assets/scanning/cdp-checks.mjs";
import pa11yConfig from "../../assets/scanning/pa11y-config.mjs";
import axeCheckMaps from "../../assets/remediation/axe-check-maps.mjs";
import codePatterns from "../../assets/remediation/code-patterns.mjs";
import guardrails from "../../assets/remediation/guardrails.mjs";
import intelligence from "../../assets/remediation/intelligence.mjs";
import sourceBoundaries from "../../assets/remediation/source-boundaries.mjs";
import complianceConfig from "../../assets/reporting/compliance-config.mjs";
import manualChecks from "../../assets/reporting/manual-checks.mjs";
import wcagReference from "../../assets/reporting/wcag-reference.mjs";
import knowledgeUx from "../../assets/knowledge/ux-copy.mjs";

/**
 * Pre-loaded asset map. Each value is the parsed JSON object, ready to use.
 */
export const ASSETS = {
  discovery: {
    crawlerConfig,
    stackDetection,
  },
  scanning: {
    cdpChecks,
    pa11yConfig,
  },
  engine: {
    cdpChecks,
    pa11yConfig,
  },
  remediation: {
    intelligence,
    axeCheckMaps,
    guardrails,
    sourceBoundaries,
    codePatterns,
  },
  reporting: {
    complianceConfig,
    wcagReference,
    manualChecks,
  },
  knowledge: {
    uxCopy: knowledgeUx,
  },
};

/**
 * Backwards-compatible path map. Points to the same assets but by key name.
 * Consumers that used ASSET_PATHS + loadAssetJson can now use ASSETS directly.
 * @deprecated Use ASSETS instead.
 */
export const ASSET_PATHS = {
  discovery: {
    crawlerConfig: "discovery.crawlerConfig",
    stackDetection: "discovery.stackDetection",
  },
  scanning: {
    cdpChecks: "scanning.cdpChecks",
    pa11yConfig: "scanning.pa11yConfig",
  },
  engine: {
    cdpChecks: "scanning.cdpChecks",
    pa11yConfig: "scanning.pa11yConfig",
  },
  remediation: {
    intelligence: "remediation.intelligence",
    axeCheckMaps: "remediation.axeCheckMaps",
    guardrails: "remediation.guardrails",
    sourceBoundaries: "remediation.sourceBoundaries",
    codePatterns: "remediation.codePatterns",
  },
  reporting: {
    complianceConfig: "reporting.complianceConfig",
    wcagReference: "reporting.wcagReference",
    manualChecks: "reporting.manualChecks",
  },
  knowledge: {
    uxCopy: "knowledge.uxCopy",
  },
};

/**
 * Backwards-compatible loader. Returns the pre-imported asset by path key.
 * @param {string} pathKey - The ASSET_PATHS key (e.g., "reporting.complianceConfig")
 * @param {string} label - Human-readable label for error messages.
 * @returns {object} The parsed asset data.
 */
export function loadAssetJson(pathKey, label) {
  const parts = pathKey.split(".");
  let obj = ASSETS;
  for (const part of parts) {
    obj = obj?.[part];
  }
  if (!obj) {
    throw new Error(`Missing or invalid ${label} — asset key "${pathKey}" not found.`);
  }
  return obj;
}
