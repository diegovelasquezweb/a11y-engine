/**
 * @file dom-scanner.mjs
 * @description Accessibility scanner core.
 * Responsible for crawling the target website, discovering routes,
 * and performing the automated axe-core analysis on identified pages
 * using Playwright for browser orchestration.
 */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { log, DEFAULTS, writeJson, getInternalPath } from "../core/utils.mjs";
import { ASSET_PATHS, loadAssetJson } from "../core/asset-loader.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CRAWLER_CONFIG = loadAssetJson(
  ASSET_PATHS.discovery.crawlerConfig,
  "assets/discovery/crawler-config.json",
);
const STACK_DETECTION = loadAssetJson(
  ASSET_PATHS.discovery.stackDetection,
  "assets/discovery/stack-detection.json",
);
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
];

/**
 * Prints the CLI usage instructions and available options to the console.
 */
function printUsage() {
  log.info(`Usage:
  node scripts/engine/dom-scanner.mjs --base-url <url> [options]

Options:
  --routes <csv|newline>      Optional route list (same-origin paths/urls)
  --output <path>             Output JSON path (default: internal)
  --max-routes <number>       Max routes to analyze (default: 10)
  --wait-ms <number>          Time to wait after load (default: 2000)
  --timeout-ms <number>       Request timeout (default: 30000)
  --headless <boolean>        Run headless (default: true)
  --color-scheme <value>      Emulate color scheme: "light" or "dark" (default: "light")
  --screenshots-dir <path>    Directory to save element screenshots (optional)
  --exclude-selectors <csv>   Selectors to exclude from scan
  --only-rule <id>            Only check for this specific rule ID (ignores tags)
  --crawl-depth <number>      How deep to follow links during discovery (1-3, default: 2)
  --wait-until <value>        Page load strategy: domcontentloaded|load|networkidle (default: domcontentloaded)
  --viewport <WxH>            Viewport dimensions as WIDTHxHEIGHT (e.g., 375x812)
  -h, --help                  Show this help
`);
}

/**
 * Parses command-line arguments into a structured configuration object.
 * @param {string[]} argv - Array of command-line arguments (process.argv.slice(2)).
 * @returns {Object} A configuration object for the scanner.
 * @throws {Error} If the required --base-url argument is missing.
 */
function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const args = {
    baseUrl: "",
    routes: "",
    output: getInternalPath("a11y-scan-results.json"),
    maxRoutes: DEFAULTS.maxRoutes,
    waitMs: DEFAULTS.waitMs,
    timeoutMs: DEFAULTS.timeoutMs,
    headless: DEFAULTS.headless,
    waitUntil: DEFAULTS.waitUntil,
    colorScheme: null,
    screenshotsDir: null,
    excludeSelectors: [],
    onlyRule: null,
    crawlDepth: DEFAULTS.crawlDepth,
    viewport: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;

    if (key === "--headed") { args.headless = false; continue; }

    const value = argv[i + 1];
    if (value === undefined) continue;

    if (key === "--base-url") args.baseUrl = value;
    if (key === "--routes") args.routes = value;
    if (key === "--output") args.output = value;
    if (key === "--max-routes") args.maxRoutes = Number.parseInt(value, 10);
    if (key === "--wait-ms") args.waitMs = Number.parseInt(value, 10);
    if (key === "--timeout-ms") args.timeoutMs = Number.parseInt(value, 10);
    if (key === "--headless") args.headless = value !== "false";
    if (key === "--only-rule") args.onlyRule = value;
    if (key === "--crawl-depth") args.crawlDepth = Number.parseInt(value, 10);
    if (key === "--wait-until") args.waitUntil = value;
    if (key === "--exclude-selectors")
      args.excludeSelectors = value.split(",").map((s) => s.trim());
    if (key === "--color-scheme") args.colorScheme = value;
    if (key === "--screenshots-dir") args.screenshotsDir = value;
    if (key === "--viewport") {
      const [w, h] = value.split("x").map(Number);
      if (w && h) args.viewport = { width: w, height: h };
    }
    i += 1;
  }

  args.crawlDepth = Math.min(Math.max(args.crawlDepth, 1), 3);
  if (!args.baseUrl) throw new Error("Missing required --base-url");
  return args;
}

const BLOCKED_EXTENSIONS = new RegExp(
  "\\.(" + CRAWLER_CONFIG.blockedExtensions.join("|") + ")$",
  "i",
);

const PAGINATION_PARAMS = new RegExp(
  "^(" + CRAWLER_CONFIG.paginationParams.join("|") + ")$",
  "i",
);

/**
 * Attempts to discover additional routes by fetching and parsing the sitemap.xml.
 * @param {string} origin - The origin (protocol + domain) of the target site.
 * @returns {Promise<string[]>} A list of discovered route paths/URLs.
 */
async function discoverFromSitemap(origin) {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) =>
      m[1].trim(),
    );
    const routes = new Set();
    for (const loc of locs) {
      const normalized = normalizePath(loc, origin);
      if (normalized && normalized !== "/") routes.add(normalized);
    }
    return [...routes];
  } catch {
    return [];
  }
}

/**
 * Fetches and parses robots.txt to identify paths disallowed for crawlers.
 * @param {string} origin - The origin of the target site.
 * @returns {Promise<Set<string>>} A set of disallowed path prefixes.
 */
async function fetchDisallowedPaths(origin) {
  const disallowed = new Set();
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return disallowed;
    const text = await res.text();
    let inUserAgentAll = false;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (/^User-agent:\s*\*/i.test(line)) {
        inUserAgentAll = true;
        continue;
      }
      if (/^User-agent:/i.test(line)) {
        inUserAgentAll = false;
        continue;
      }
      if (inUserAgentAll) {
        const match = line.match(/^Disallow:\s*(.+)/i);
        if (match) {
          const p = match[1].trim();
          if (p) disallowed.add(p);
        }
      }
    }
  } catch {
    // silent — robots.txt is optional
  }
  return disallowed;
}

/**
 * Checks if a specific route path matches any of the disallowed patterns from robots.txt.
 * @param {string} routePath - The path to check.
 * @param {Set<string>} disallowedPaths - Set of disallowed patterns/prefixes.
 * @returns {boolean} True if the path is disallowed, false otherwise.
 */
function isDisallowedPath(routePath, disallowedPaths) {
  for (const rule of disallowedPaths) {
    if (routePath.startsWith(rule)) return true;
  }
  return false;
}

/**
 * Normalizes a URL or path to a relative hashless path if it belongs to the same origin.
 * @param {string} rawValue - The raw URL or path string to normalize.
 * @param {string} origin - The origin of the target site.
 * @returns {string} The normalized relative path, or an empty string if invalid/external.
 */
export function normalizePath(rawValue, origin) {
  if (!rawValue) return "";
  try {
    const u = new URL(rawValue, origin);
    if (u.origin !== origin) return "";
    if (BLOCKED_EXTENSIONS.test(u.pathname)) return "";
    const hashless = `${u.pathname || "/"}${u.search || ""}`;
    return hashless === "" ? "/" : hashless;
  } catch {
    return "";
  }
}

/**
 * Parses the --routes CLI argument (CSV or newline-separated) into a list of normalized paths.
 * @param {string} routesArg - The raw string from the --routes argument.
 * @param {string} origin - The origin of the target site.
 * @returns {string[]} A list of unique, normalized route paths.
 */
export function parseRoutesArg(routesArg, origin) {
  if (!routesArg.trim()) return [];
  const entries = routesArg
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

  const uniq = new Set();
  for (const value of entries) {
    const normalized = normalizePath(value, origin);
    if (normalized) uniq.add(normalized);
  }
  return [...uniq];
}

/**
 * Crawls the website to discover additional routes starting from the base URL.
 * @param {import("playwright").Page} page - The Playwright page object.
 * @param {string} baseUrl - The starting URL for discovery.
 * @param {number} maxRoutes - Maximum number of routes to discover.
 * @param {number} crawlDepth - How deep to follow links (1-3).
 * @returns {Promise<string[]>} A list of discovered route paths.
 */
export async function discoverRoutes(page, baseUrl, maxRoutes, crawlDepth = 2) {
  const origin = new URL(baseUrl).origin;
  const routes = new Set(["/"]);
  const seenPathnames = new Set(["/"]);
  const visited = new Set();
  let frontier = ["/"];

  function extractLinks(hrefs) {
    const newRoutes = [];
    for (const href of hrefs) {
      if (routes.size >= maxRoutes) break;
      const normalized = normalizePath(href, origin);
      if (!normalized) continue;
      try {
        const u = new URL(normalized, origin);
        const hasPagination = [...new URLSearchParams(u.search).keys()].some(
          (k) => PAGINATION_PARAMS.test(k),
        );
        if (hasPagination && seenPathnames.has(u.pathname)) continue;
        seenPathnames.add(u.pathname);
      } catch {
        // keep non-parseable normalized paths as-is
      }
      if (!routes.has(normalized)) {
        routes.add(normalized);
        newRoutes.push(normalized);
      }
    }
    return newRoutes;
  }

  for (let depth = 0; depth < crawlDepth && frontier.length > 0; depth++) {
    const nextFrontier = [];

    for (const routePath of frontier) {
      if (routes.size >= maxRoutes) break;
      if (visited.has(routePath)) continue;
      visited.add(routePath);

      try {
        const targetUrl = new URL(routePath, origin).toString();
        if (page.url() !== targetUrl) {
          await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 10000,
          });
        }

        const hrefs = await page.$$eval("a[href]", (elements) =>
          elements.map((el) => el.getAttribute("href")),
        );
        nextFrontier.push(...extractLinks(hrefs));
      } catch (error) {
        log.warn(`Discovery skip ${routePath}: ${error.message}`);
      }
    }

    frontier = nextFrontier;
    if (routes.size >= maxRoutes) break;
  }

  log.info(
    `Crawl depth ${Math.min(crawlDepth, 3)}: ${routes.size} route(s) discovered (visited ${visited.size} page(s))`,
  );
  return [...routes].slice(0, maxRoutes);
}

/**
 * Detects the web framework and UI libraries used by analyzing package.json and file structure.
 * @returns {Object} An object containing detected framework and UI libraries.
 */
function detectProjectContext() {
  const uiLibraries = [];
  let pkgFramework = null;
  let fileFramework = null;

  const projectDir = process.env.A11Y_PROJECT_DIR || process.cwd();

  try {
    const pkgPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const allDeps = Object.keys({
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      });
      for (const [dep, fw] of STACK_DETECTION.frameworkPackageDetectors) {
        if (allDeps.some((d) => d === dep || d.startsWith(`${dep}/`))) {
          pkgFramework = fw;
          break;
        }
      }
      for (const [prefix, name] of STACK_DETECTION.uiLibraryPackageDetectors) {
        if (allDeps.some((d) => d === prefix || d.startsWith(`${prefix}/`))) {
          uiLibraries.push(name);
        }
      }
    }
  } catch { /* package.json unreadable */ }

  if (!pkgFramework) {
    for (const [fw, files] of STACK_DETECTION.platformStructureDetectors || []) {
      if (files.some((f) => fs.existsSync(path.join(projectDir, f)))) {
        fileFramework = fw;
        break;
      }
    }
  }

  const resolvedFramework = pkgFramework || fileFramework;

  if (resolvedFramework) {
    const source = pkgFramework ? "(from package.json)" : "(from file structure)";
    log.info(`Detected framework: ${resolvedFramework} ${source}`);
  }
  if (uiLibraries.length) log.info(`Detected UI libraries: ${uiLibraries.join(", ")}`);

  return { framework: resolvedFramework, uiLibraries };
}

/**
 * Navigates to a route and performs an axe-core accessibility analysis.
 * @param {import("playwright").Page} page - The Playwright page object.
 * @param {string} routeUrl - The full URL of the route to analyze.
 * @param {number} waitMs - Time to wait after page load.
 * @param {string[]} excludeSelectors - CSS selectors to exclude from the scan.
 * @param {string|null} onlyRule - Specific rule ID to check (optional).
 * @param {number} timeoutMs - Navigation and analysis timeout.
 * @param {number} maxRetries - Number of retries on failure.
 * @param {string} waitUntil - Playwright load state strategy.
 * @returns {Promise<Object>} The analysis results for the route.
 */
async function analyzeRoute(
  page,
  routeUrl,
  waitMs,
  excludeSelectors,
  onlyRule,
  timeoutMs = 30000,
  maxRetries = 2,
  waitUntil = "domcontentloaded",
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      await page.goto(routeUrl, {
        waitUntil,
        timeout: timeoutMs,
      });
      await page
        .waitForLoadState("networkidle", { timeout: waitMs })
        .catch(() => {});

      const builder = new AxeBuilder({ page });

      if (onlyRule) {
        log.info(`Targeted Audit: Only checking rule "${onlyRule}"`);
        builder.withRules([onlyRule]);
      } else {
        builder.withTags(AXE_TAGS);
      }

      if (Array.isArray(excludeSelectors)) {
        for (const selector of excludeSelectors) {
          builder.exclude(selector);
        }
      }

      const axeResults = await builder.analyze();

      if (!Array.isArray(axeResults?.violations)) {
        throw new Error(
          "axe-core returned an unexpected response — violations array missing.",
        );
      }

      const metadata = await page.evaluate(() => {
        return {
          title: document.title,
        };
      });

      return {
        url: routeUrl,
        violations: axeResults.violations,
        incomplete: axeResults.incomplete,
        passes: axeResults.passes.map((p) => p.id),
        metadata,
      };
    } catch (error) {
      lastError = error;
      if (attempt <= maxRetries) {
        log.warn(
          `[attempt ${attempt}/${maxRetries + 1}] Retrying ${routeUrl}: ${error.message}`,
        );
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }

  log.error(
    `Failed to analyze ${routeUrl} after ${maxRetries + 1} attempts: ${lastError.message}`,
  );
  return {
    url: routeUrl,
    error: lastError.message,
    violations: [],
    passes: [],
    metadata: {},
  };
}

/**
 * The main execution function for the accessibility scanner.
 * Coordinates browser setup, crawling/discovery, parallel scanning, and result saving.
 * @throws {Error} If navigation to the base URL fails or browser setup issues occur.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = new URL(args.baseUrl).toString();
  const origin = new URL(baseUrl).origin;

  log.info(`Starting accessibility audit for ${baseUrl}`);

  const primaryViewport = args.viewport || {
    width: DEFAULTS.viewports[0].width,
    height: DEFAULTS.viewports[0].height,
  };

  const browser = await chromium.launch({
    headless: args.headless,
  });
  const context = await browser.newContext({
    viewport: primaryViewport,
    reducedMotion: "no-preference",
    colorScheme: args.colorScheme || DEFAULTS.colorScheme,
    forcedColors: "none",
    locale: "en-US",
  });
  const page = await context.newPage();

  let routes = [];
  let projectContext = { framework: null, uiLibraries: [] };
  try {
    await page.goto(baseUrl, {
      waitUntil: args.waitUntil,
      timeout: args.timeoutMs,
    });

    projectContext = detectProjectContext();

    const cliRoutes = parseRoutesArg(args.routes, origin);

    if (cliRoutes.length > 0) {
      routes = cliRoutes.slice(0, args.maxRoutes);
    } else if (baseUrl.startsWith("file://")) {
      routes = [""];
    } else {
      log.info("Autodiscovering routes...");
      const sitemapRoutes = await discoverFromSitemap(origin);
      if (sitemapRoutes.length > 0) {
        routes = [...new Set(["/", ...sitemapRoutes])].slice(0, args.maxRoutes);
        log.info(
          `Sitemap: ${routes.length} route(s) discovered from /sitemap.xml`,
        );
      } else {
        const crawled = await discoverRoutes(
          page,
          baseUrl,
          args.maxRoutes,
          args.crawlDepth,
        );
        routes = [...crawled];
      }
      if (routes.length === 0) routes = ["/"];
    }
  } catch (err) {
    log.error(`Fatal: Could not load base URL ${baseUrl}: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  /**
   * Selectors that should never be targeted for element screenshots.
   * @type {Set<string>}
   */
  const SKIP_SELECTORS = new Set(["html", "body", "head", ":root", "document"]);

  /**
   * Captures a screenshot of an element associated with an accessibility violation.
   * @param {import("playwright").Page} tabPage - The Playwright page object.
   * @param {Object} violation - The axe-core violation object.
   * @param {number} routeIndex - The index of the current route (used for filenames).
   */
  async function captureElementScreenshot(tabPage, violation, routeIndex) {
    if (!args.screenshotsDir) return;
    const firstNode = violation.nodes?.[0];
    if (!firstNode || firstNode.target.length > 1) return;
    const selector = firstNode.target[0];
    if (!selector || SKIP_SELECTORS.has(selector.toLowerCase())) return;
    try {
      fs.mkdirSync(args.screenshotsDir, { recursive: true });
      const safeRuleId = violation.id.replace(/[^a-z0-9-]/g, "-");
      const filename = `${routeIndex}-${safeRuleId}.png`;
      const screenshotPath = path.join(args.screenshotsDir, filename);
      await tabPage
        .locator(selector)
        .first()
        .scrollIntoViewIfNeeded({ timeout: 3000 });
      await tabPage.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const overlay = document.createElement("div");
        overlay.id = "__a11y_highlight__";
        Object.assign(overlay.style, {
          position: "fixed",
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width || 40}px`,
          height: `${rect.height || 20}px`,
          outline: "3px solid #ef4444",
          outlineOffset: "2px",
          backgroundColor: "rgba(239,68,68,0.12)",
          zIndex: "2147483647",
          pointerEvents: "none",
          boxSizing: "border-box",
        });
        document.body.appendChild(overlay);
      }, selector);
      await tabPage.screenshot({ path: screenshotPath });
      violation.screenshot_path = `screenshots/${filename}`;
      await tabPage.evaluate(() =>
        document.getElementById("__a11y_highlight__")?.remove(),
      );
    } catch (err) {
      log.warn(
        `Screenshot skipped for "${violation.id}" (${selector}): ${err.message}`,
      );
      await tabPage
        .evaluate(() => document.getElementById("__a11y_highlight__")?.remove())
        .catch(() => {});
    }
  }

  /** @const {number} Default concurrency level for parallel scanning tabs. */
  const TAB_CONCURRENCY = 3;
  let results = [];
  let total = 0;

  try {
    const disallowed = await fetchDisallowedPaths(origin);
    if (disallowed.size > 0) {
      const before = routes.length;
      routes = routes.filter((r) => !isDisallowedPath(r, disallowed));
      const skipped = before - routes.length;
      if (skipped > 0)
        log.info(`robots.txt: ${skipped} route(s) excluded (Disallow rules)`);
    }

    results = new Array(routes.length);
    total = routes.length;

    log.info(
      `Targeting ${routes.length} routes (${Math.min(TAB_CONCURRENCY, routes.length)} parallel tabs): ${routes.join(", ")}`,
    );

    const tabPages = [page];
    for (let t = 1; t < Math.min(TAB_CONCURRENCY, routes.length); t++) {
      tabPages.push(await context.newPage());
    }

    for (let i = 0; i < routes.length; i += tabPages.length) {
      const batch = [];
      for (let j = 0; j < tabPages.length && i + j < routes.length; j++) {
        const idx = i + j;
        const tabPage = tabPages[j];
        batch.push(
          (async () => {
            const routePath = routes[idx];
            log.info(`[${idx + 1}/${total}] Scanning: ${routePath}`);
            const targetUrl = new URL(routePath, baseUrl).toString();
            const result = await analyzeRoute(
              tabPage,
              targetUrl,
              args.waitMs,
              args.excludeSelectors,
              args.onlyRule,
              args.timeoutMs,
              2,
              args.waitUntil,
            );
            if (args.screenshotsDir && result.violations) {
              for (const violation of result.violations) {
                await captureElementScreenshot(tabPage, violation, idx);
              }
            }
            results[idx] = { path: routePath, ...result };
          })(),
        );
      }
      await Promise.all(batch);
    }
  } finally {
    await browser.close();
  }

  const payload = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    onlyRule: args.onlyRule || null,
    projectContext,
    routes: results,
  };

  writeJson(args.output, payload);
  log.success(`Routes scan complete. Results saved to ${args.output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    log.error(`Scanner Execution Error: ${error.message}`);
    process.exit(1);
  });
}
