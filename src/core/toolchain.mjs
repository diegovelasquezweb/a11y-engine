/**
 * @file toolchain.mjs
 * @description Validates the development environment and required dependencies for the a11y skill.
 * Checks for the presence of node_modules and installed Playwright browsers.
 */

import { SKILL_ROOT, log } from "./utils.mjs";
import fs from "node:fs";
import path from "node:path";

/**
 * Prints the CLI usage instructions and available options for the toolchain checker.
 */
function printUsage() {
  log.info(`Usage:
  node toolchain.mjs [options]

Options:
  -h, --help               Show this help
`);
}

/**
 * Parses command-line arguments to handle the help flag.
 * @param {string[]} argv - Array of command-line arguments.
 */
function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }
}

/**
 * Verifies if the local node_modules directory exists.
 * @returns {boolean} True if the directory exists, false otherwise.
 */
function checkNodeModules() {
  const nodeModulesPath = path.join(SKILL_ROOT, "node_modules");
  return fs.existsSync(nodeModulesPath);
}

/**
 * Verifies if Playwright browsers are properly installed and accessible.
 * @returns {Promise<boolean>} True if the Chromium executable exists, false otherwise.
 */
async function checkPlaywrightBrowsers() {
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    return fs.existsSync(executablePath);
  } catch {
    return false;
  }
}

/**
 * The main execution function for the toolchain validation.
 * Performs all checks and logs results to the console.
 * @throws {Error} If any critical dependency is missing.
 */
async function main() {
  parseArgs(process.argv.slice(2));
  const checks = [];

  const modulesOk = checkNodeModules();
  checks.push({
    tool: "Local dependencies (node_modules)",
    required: true,
    ok: modulesOk,
    fix: "Run 'pnpm install' to initialize the skill dependencies.",
  });

  const pwOk = await checkPlaywrightBrowsers();
  checks.push({
    tool: "Playwright installed",
    required: true,
    ok: pwOk,
    fix: "Run 'pnpm install' (browsers should install automatically via postinstall or verify with 'npx playwright install').",
  });

  const blockers = checks.filter((c) => c.required && !c.ok);
  const result = {
    checked_at: new Date().toISOString(),
    checks,
    blockers: blockers.map((b) => ({ tool: b.tool, fix: b.fix })),
    ok: blockers.length === 0,
  };

  if (result.ok) {
    log.success("Toolchain is ready.");
  } else {
    log.error(`Toolchain has ${blockers.length} blockers.`);
    blockers.forEach((b) => log.warn(`Missing: ${b.tool}. Fix: ${b.fix}`));
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Toolchain Check Failure: ${error.message}`);
  process.exit(1);
});
