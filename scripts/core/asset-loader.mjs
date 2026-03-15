/**
 * @file assets.mjs
 * @description Centralized asset paths and JSON loaders for the a11y skill.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/**
 * Resolves the assets root directory. Uses import.meta.url when running from
 * the original file location (CLI, direct node). Falls back to require.resolve
 * when running inside a bundler (e.g. Turbopack) where import.meta.url points
 * to a generated chunk instead of the original file.
 */
function resolveAssetRoot() {
  // Primary: resolve relative to this file's location
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.join(selfDir, "..", "..", "assets");
  if (fs.existsSync(candidate)) return candidate;

  // Fallback: resolve via require.resolve against node_modules
  try {
    const req = createRequire(import.meta.url);
    const pkgJson = req.resolve("@diegovelasquezweb/a11y-engine/package.json");
    const pkgRoot = path.dirname(pkgJson);
    const fallback = path.join(pkgRoot, "assets");
    if (fs.existsSync(fallback)) return fallback;
  } catch { /* not installed as dependency — skip */ }

  // Last resort: original candidate (will fail with a clear error at load time)
  return candidate;
}

const ASSET_ROOT = resolveAssetRoot();

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
  engine: {
    cdpChecks: path.join(ASSET_ROOT, "engine", "cdp-checks.json"),
    pa11yConfig: path.join(ASSET_ROOT, "engine", "pa11y-config.json"),
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
