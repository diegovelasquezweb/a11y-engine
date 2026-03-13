/**
 * @file assets.mjs
 * @description Centralized asset paths and JSON loaders for the a11y skill.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_ROOT = path.join(__dirname, "..", "..", "assets");

export const ASSET_PATHS = {
  discovery: {
    crawlerConfig: path.join(ASSET_ROOT, "discovery", "crawler-config.json"),
    stackDetection: path.join(
      ASSET_ROOT,
      "discovery",
      "stack-detection.json",
    ),
  },
  remediation: {
    intelligence: path.join(ASSET_ROOT, "remediation", "intelligence.json"),
    axeCheckMaps: path.join(
      ASSET_ROOT,
      "remediation",
      "axe-check-maps.json",
    ),
    guardrails: path.join(ASSET_ROOT, "remediation", "guardrails.json"),
    sourceBoundaries: path.join(
      ASSET_ROOT,
      "remediation",
      "source-boundaries.json",
    ),
    codePatterns: path.join(ASSET_ROOT, "remediation", "code-patterns.json"),
  },
  reporting: {
    wcagReference: path.join(ASSET_ROOT, "reporting", "wcag-reference.json"),
    complianceConfig: path.join(
      ASSET_ROOT,
      "reporting",
      "compliance-config.json",
    ),
    manualChecks: path.join(ASSET_ROOT, "reporting", "manual-checks.json"),
  },
};

export function loadAssetJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    throw new Error(`Missing or invalid ${label} — reinstall the skill.`);
  }
}
