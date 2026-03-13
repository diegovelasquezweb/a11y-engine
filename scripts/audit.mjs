/**
 * @file audit.mjs
 * @description Orchestrator for the accessibility audit pipeline.
 * Coordinates the multi-stage process including dependency verification,
 * site discovery/crawling, automated analysis, and final report generation.
 */

import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { log, DEFAULTS, SKILL_ROOT, getInternalPath } from "./core/utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Prints the CLI usage instructions and available command-line options.
 * This is displayed when the user runs the script with --help or provides invalid arguments.
 */
function printUsage() {
  log.info(`Usage:
  node scripts/audit.mjs --base-url <url> [options]

Targeting & Scope:
  --base-url <url>        (Required) The target website to audit.
  --max-routes <num>      Max routes to discover and scan (default: 10).
  --crawl-depth <num>     How deep to follow links during discovery (1-3, default: 2).
  --routes <csv>          Custom list of paths to scan.
  --project-dir <path>    Path to the audited project (for stack auto-detection).

Audit Intelligence:
  --target <text>         Compliance target label (default: "WCAG 2.2 AA").
  --only-rule <id>        Only check for this specific rule ID.
  --ignore-findings <csv> Ignore specific rule IDs.
  --exclude-selectors <csv> Exclude CSS selectors from scan.

Execution & Emulation:
  --color-scheme <val>    Emulate color scheme: "light" or "dark".
  --wait-until <val>      Page load strategy: domcontentloaded|load|networkidle (default: domcontentloaded).
  --framework <val>       Override auto-detected stack (nextjs|gatsby|react|nuxt|vue|angular|astro|svelte|shopify|wordpress|drupal).
  --viewport <WxH>        Viewport dimensions as WIDTHxHEIGHT (e.g., 375x812 for mobile).
  --headed                Run browser in visible mode (overrides headless).
  --with-reports          Generate HTML and PDF reports (requires --output).
  --skip-reports          Omit HTML and PDF report generation (default).
  --skip-patterns         Skip source code pattern scanning even if --project-dir is set.
  --affected-only         Re-scan only routes that had violations in the previous scan (faster re-audits).
  --wait-ms <num>         Time to wait after page load (default: 2000).
  --timeout-ms <num>      Network timeout (default: 30000).
  -h, --help              Show this help.
`);
}

/** @const {number} Execution timeout for child processes (15 minutes). */
const SCRIPT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Helper function to run a Node.js script as a child process.
 * @param {string} scriptName - File name of the script located in the same directory.
 * @param {string[]} [args=[]] - Command line arguments to pass to the script.
 * @param {Object} [env={}] - Optional environment variables for the child process.
 * @returns {Promise<void>} Resolves when the script finishes successfully.
 * @throws {Error} If the process exits with a non-zero code or times out.
 */
async function runScript(scriptName, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    log.info(`Running: ${scriptName} ${args.join(" ")}`);

    const proc = spawn("node", [scriptPath, ...args], {
      stdio: "inherit",
      cwd: SKILL_ROOT,
      env: { ...process.env, ...env },
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(
        new Error(
          `Script ${scriptName} timed out after ${SCRIPT_TIMEOUT_MS / 1000}s`,
        ),
      );
    }, SCRIPT_TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start ${scriptName}: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptName} failed with exit code ${code}`));
      }
    });
  });
}

/**
 * The main application entry point for the accessibility audit orchestrator.
 * Orchestrates the entire audit flow:
 * 1. Validates inputs and environment
 * 2. Ensures dependencies and toolchain are ready
 * 3. Executes site discovery and scanning
 * 4. Runs findings analysis and enrichment
 * 5. Generates the final audit reports (Markdown, HTML, PDF)
 * @throws {Error} If any stage of the audit pipeline fails.
 */
async function main() {
  const argv = process.argv.slice(2);

  /**
   * Internal helper to extract values from command line flags.
   * Supports both --flag=value and --flag value formats.
   * @param {string} name - The flag name without the leading dashes.
   * @returns {string|null} The value of the flag.
   */
  function getArgValue(name) {
    const entry = argv.find((a) => a.startsWith(`--${name}=`));
    if (entry) return entry.split("=")[1];
    const index = argv.indexOf(`--${name}`);
    if (index !== -1 && argv[index + 1]) return argv[index + 1];
    return null;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const baseUrl = getArgValue("base-url");
  const maxRoutes = getArgValue("max-routes") || DEFAULTS.maxRoutes;
  const crawlDepth = getArgValue("crawl-depth") || DEFAULTS.crawlDepth;
  const routes = getArgValue("routes");
  const waitMs = getArgValue("wait-ms") || DEFAULTS.waitMs;
  const timeoutMs = getArgValue("timeout-ms") || DEFAULTS.timeoutMs;

  const sessionFile = getInternalPath("a11y-session.json");
  let projectDir = getArgValue("project-dir");
  if (projectDir) {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify({ project_dir: path.resolve(projectDir) }), "utf-8");
  } else if (fs.existsSync(sessionFile)) {
    try {
      const session = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
      if (session.project_dir) projectDir = session.project_dir;
    } catch { /* ignore malformed session file */ }
  }

  const colorScheme = getArgValue("color-scheme");
  const target = getArgValue("target");
  const headless = !argv.includes("--headed");

  const onlyRule = getArgValue("only-rule");
  const skipReports = argv.includes("--skip-reports") || !argv.includes("--with-reports");
  const skipPatterns = argv.includes("--skip-patterns");
  const affectedOnly = argv.includes("--affected-only");
  const ignoreFindings = getArgValue("ignore-findings");
  const excludeSelectors = getArgValue("exclude-selectors");

  const waitUntil = getArgValue("wait-until");
  const framework = getArgValue("framework");
  const viewportArg = getArgValue("viewport");
  let viewport = null;
  if (viewportArg) {
    const [w, h] = viewportArg.split("x").map(Number);
    if (w && h) viewport = { width: w, height: h };
  }

  if (!baseUrl) {
    log.error("Missing required argument: --base-url");
    log.info("Usage: node scripts/audit.mjs --base-url <url> [options]");
    process.exit(1);
  }

  try {
    new URL(baseUrl);
  } catch {
    log.error(
      `Invalid URL: "${baseUrl}". Provide a full URL including protocol (e.g., https://example.com).`,
    );
    process.exit(1);
  }

  const childEnv = {};
  if (projectDir) childEnv.A11Y_PROJECT_DIR = path.resolve(projectDir);

  try {
    log.info("Starting accessibility audit pipeline...");

    const nodeModulesPath = path.join(SKILL_ROOT, "node_modules");
    if (!fs.existsSync(nodeModulesPath)) {
      log.info(
        "First run detected — installing skill dependencies (one-time setup)...",
      );
      try {
        execSync("pnpm install", { cwd: SKILL_ROOT, stdio: "ignore" });
      } catch {
        execSync("npm install", { cwd: SKILL_ROOT, stdio: "ignore" });
      }
      log.success("Dependencies ready.");
    }

    await runScript("core/toolchain.mjs");

    const screenshotsDir = getInternalPath("screenshots");
    fs.rmSync(screenshotsDir, { recursive: true, force: true });

    let effectiveRoutes = routes;
    if (affectedOnly && !routes) {
      const prevScanPath = getInternalPath("a11y-scan-results.json");
      if (fs.existsSync(prevScanPath)) {
        try {
          const prevScan = JSON.parse(fs.readFileSync(prevScanPath, "utf-8"));
          const affected = (prevScan.routes ?? [])
            .filter((r) => Array.isArray(r.violations) && r.violations.length > 0)
            .map((r) => r.path);
          if (affected.length > 0) {
            effectiveRoutes = affected.join(",");
            log.info(`--affected-only: re-scanning ${affected.length} route(s) with previous violations.`);
          } else {
            log.info("--affected-only: no previous violations found — running full scan.");
          }
        } catch { /* fallback to full scan */ }
      } else {
        log.info("--affected-only: no previous scan found — running full scan.");
      }
    }

    const scanArgs = [
      "--base-url",
      baseUrl,
      "--max-routes",
      maxRoutes.toString(),
      "--wait-ms",
      waitMs.toString(),
      "--timeout-ms",
      timeoutMs.toString(),
      "--headless",
      headless.toString(),
      "--screenshots-dir",
      screenshotsDir,
      "--crawl-depth",
      crawlDepth.toString(),
    ];
    if (onlyRule) scanArgs.push("--only-rule", onlyRule);
    if (excludeSelectors)
      scanArgs.push("--exclude-selectors", excludeSelectors);
    if (effectiveRoutes) scanArgs.push("--routes", effectiveRoutes);
    if (colorScheme) scanArgs.push("--color-scheme", colorScheme);
    if (waitUntil) scanArgs.push("--wait-until", waitUntil);
    if (viewport) {
      scanArgs.push("--viewport", `${viewport.width}x${viewport.height}`);
    }

    await runScript("engine/dom-scanner.mjs", scanArgs, childEnv);

    const analyzerArgs = [];
    if (ignoreFindings) analyzerArgs.push("--ignore-findings", ignoreFindings);
    if (framework) analyzerArgs.push("--framework", framework);
    await runScript("engine/analyzer.mjs", analyzerArgs);

    if (projectDir && !skipPatterns) {
      const patternArgs = ["--project-dir", path.resolve(projectDir)];
      let resolvedFramework = framework;
      if (!resolvedFramework) {
        try {
          const findings = JSON.parse(fs.readFileSync(getInternalPath("a11y-findings.json"), "utf-8"));
          resolvedFramework = findings?.metadata?.projectContext?.framework ?? null;
        } catch { /* ignore */ }
      }
      if (resolvedFramework) patternArgs.push("--framework", resolvedFramework);
      await runScript("engine/source-scanner.mjs", patternArgs);
    }

    const mdOutput = getInternalPath("remediation.md");
    const mdArgs = ["--output", mdOutput, "--base-url", baseUrl];
    if (target) mdArgs.push("--target", target);

    if (skipReports) {
      await runScript("reports/builders/md.mjs", mdArgs);
    } else {
      const output = getArgValue("output");
      if (!output) {
        log.error(
          "When using --with-reports, you must specify --output <path> for the HTML report location.",
        );
        process.exit(1);
      }
      const absoluteOutputPath = path.isAbsolute(output)
        ? output
        : path.resolve(output);

      const buildArgs = ["--output", absoluteOutputPath, "--base-url", baseUrl];
      if (target) buildArgs.push("--target", target);

      const pdfOutput = absoluteOutputPath.replace(/\.html$/, ".pdf");
      const pdfArgs = ["--output", pdfOutput, "--base-url", baseUrl];
      if (target) pdfArgs.push("--target", target);

      const checklistOutput = path.join(path.dirname(absoluteOutputPath), "checklist.html");
      const checklistArgs = ["--output", checklistOutput, "--base-url", baseUrl];

      await Promise.all([
        runScript("reports/builders/html.mjs", buildArgs),
        runScript("reports/builders/checklist.mjs", checklistArgs),
        runScript("reports/builders/md.mjs", mdArgs),
        runScript("reports/builders/pdf.mjs", pdfArgs),
      ]);

      console.log(`REPORT_PATH=${absoluteOutputPath}`);
    }

    log.success("Audit complete! Remediation roadmap ready.");
    console.log(`REMEDIATION_PATH=${mdOutput}`);
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Critical Audit Failure: ${error.message}`);
  process.exit(1);
});
