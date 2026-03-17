/**
 * @file dom-scanner.mjs
 * @description Accessibility scanner core.
 * Responsible for crawling the target website, discovering routes,
 * and performing the automated axe-core analysis on identified pages
 * using Playwright for browser orchestration.
 */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import pa11y from "pa11y";
import puppeteer from "puppeteer";
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
const CDP_CHECKS = loadAssetJson(
  ASSET_PATHS.scanning.cdpChecks,
  "assets/scanning/cdp-checks.json",
);
const PA11Y_CONFIG = loadAssetJson(
  ASSET_PATHS.scanning.pa11yConfig,
  "assets/scanning/pa11y-config.json",
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
  --engines <csv>             Engines to run: axe,cdp,pa11y (default: all)
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
    axeTags: null,
    engines: { axe: true, cdp: true, pa11y: true },
    clearCache: false,
    serverMode: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;

    if (key === "--headed") { args.headless = false; continue; }
    if (key === "--clear-cache") { args.clearCache = true; continue; }
    if (key === "--server-mode") { args.serverMode = true; continue; }

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
    if (key === "--axe-tags") args.axeTags = value.split(",").map((s) => s.trim());
    if (key === "--engines") {
      const active = value.split(",").map((s) => s.trim().toLowerCase());
      args.engines = { axe: active.includes("axe"), cdp: active.includes("cdp"), pa11y: active.includes("pa11y") };
    }
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
 * Extracts framework and UI library info from a parsed package.json object.
 * Used both for local file reads and remote GitHub API reads.
 * @param {Record<string, unknown>} pkg
 * @returns {{ framework: string|null, uiLibraries: string[] }}
 */
function detectFromPackageJson(pkg) {
  const uiLibraries = [];
  let pkgFramework = null;

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

  return { framework: pkgFramework, uiLibraries };
}

/**
 * Detects the web framework and UI libraries used by analyzing package.json and file structure.
 * Accepts either a local project directory path or a pre-parsed package.json object
 * (useful when the package.json was fetched remotely via GitHub API).
 *
 * @param {string|null} [explicitProjectDir=null] - Explicit project directory. Falls back to env/cwd.
 * @param {Record<string, unknown>|null} [remotePackageJson=null] - Pre-parsed package.json from GitHub API.
 * @returns {Object} An object containing detected framework and UI libraries.
 */
function detectProjectContext(explicitProjectDir = null, remotePackageJson = null) {
  const uiLibraries = [];
  let pkgFramework = null;
  let fileFramework = null;

  // If a remote package.json was provided (from GitHub API), use it directly
  if (remotePackageJson) {
    const result = detectFromPackageJson(remotePackageJson);
    if (result.framework) {
      log.info(`Detected framework: ${result.framework} (from remote package.json)`);
    }
    if (result.uiLibraries.length) {
      log.info(`Detected UI libraries: ${result.uiLibraries.join(", ")}`);
    }
    return result;
  }

  const projectDir = explicitProjectDir || process.env.A11Y_PROJECT_DIR || null;
  if (!projectDir) {
    return { framework: null, uiLibraries: [] };
  }

  try {
    const pkgPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const result = detectFromPackageJson(pkg);
      pkgFramework = result.framework;
      uiLibraries.push(...result.uiLibraries);
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
 * Detects the web framework, CMS, and UI libraries by inspecting the live page DOM,
 * window globals, script sources, and meta tags. This works for any remote URL
 * without needing access to the project source code.
 * @param {import("playwright").Page} page - The Playwright page object (already navigated).
 * @returns {Promise<{ framework: string|null, cms: string|null, uiLibraries: string[] }>}
 */
async function detectProjectContextFromDom(page) {
  const frameworkDetectors = STACK_DETECTION.domFrameworkDetectors || [];
  const cmsDetectors = STACK_DETECTION.domCmsDetectors || [];
  const uiDetectors = STACK_DETECTION.domUiLibraryDetectors || [];

  const result = await page.evaluate(({ frameworkDetectors, cmsDetectors, uiDetectors }) => {
    function checkSignals(signals) {
      let matched = 0;
      for (const signal of signals) {
        try {
          if (signal.kind === "global") {
            if (typeof window[signal.key] !== "undefined" && window[signal.key] !== null) {
              matched++;
            }
          } else if (signal.kind === "selector") {
            if (document.querySelector(signal.value)) {
              matched++;
            }
          } else if (signal.kind === "scriptSrc") {
            const scripts = document.querySelectorAll("script[src]");
            for (const s of scripts) {
              if (s.getAttribute("src")?.includes(signal.pattern)) {
                matched++;
                break;
              }
            }
          } else if (signal.kind === "meta") {
            const metas = document.querySelectorAll(`meta[name="${signal.name}"],meta[property="${signal.name}"]`);
            if (metas.length > 0) {
              if (signal.pattern) {
                for (const m of metas) {
                  if (m.getAttribute("content")?.toLowerCase().includes(signal.pattern.toLowerCase())) {
                    matched++;
                    break;
                  }
                }
              } else {
                matched++;
              }
            }
          }
        } catch {
          // ignore individual signal errors
        }
      }
      return matched;
    }

    function detectBest(detectors) {
      let best = null;
      let bestScore = 0;
      for (const detector of detectors) {
        const score = checkSignals(detector.signals);
        if (score > 0 && score > bestScore) {
          bestScore = score;
          best = detector.id;
        }
      }
      return best;
    }

    function detectAllUiLibs(detectors) {
      const found = [];
      for (const detector of detectors) {
        let total = 0;
        let strongSignals = 0;
        for (const signal of detector.signals) {
          try {
            let hit = false;
            if (signal.kind === "global") {
              hit = typeof window[signal.key] !== "undefined" && window[signal.key] !== null;
            } else if (signal.kind === "selector") {
              hit = !!document.querySelector(signal.value);
            } else if (signal.kind === "scriptSrc") {
              const scripts = document.querySelectorAll("script[src]");
              for (const s of scripts) {
                if (s.getAttribute("src")?.includes(signal.pattern)) { hit = true; break; }
              }
            } else if (signal.kind === "meta") {
              const metas = document.querySelectorAll(`meta[name="${signal.name}"],meta[property="${signal.name}"]`);
              for (const m of metas) {
                if (!signal.pattern || m.getAttribute("content")?.toLowerCase().includes(signal.pattern.toLowerCase())) {
                  hit = true; break;
                }
              }
            }
            if (hit) {
              total++;
              if (signal.kind !== "selector") strongSignals++;
            }
          } catch {}
        }
        if (total >= 2 || strongSignals >= 1) {
          found.push(detector.id);
        }
      }
      return found;
    }

    const framework = detectBest(frameworkDetectors);
    const cms = detectBest(cmsDetectors);
    const uiLibraries = detectAllUiLibs(uiDetectors);

    return { framework, cms, uiLibraries };
  }, { frameworkDetectors, cmsDetectors, uiDetectors });

  if (result.framework) log.info(`DOM detection: framework=${result.framework}`);
  if (result.cms) log.info(`DOM detection: cms=${result.cms}`);
  if (result.uiLibraries.length) log.info(`DOM detection: uiLibraries=${result.uiLibraries.join(", ")}`);

  return result;
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
  axeTags = null,
  clearCache = false,
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // Clear cache before navigation when requested — ensures fresh results
      // on repeated scans of the same domain within the same browser session.
      if (clearCache) {
        const cdpClient = await page.context().newCDPSession(page);
        await cdpClient.send("Network.clearBrowserCache");
        await cdpClient.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdpClient.detach();
      }

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
        const tagsToUse = axeTags || AXE_TAGS;
        builder.withTags(tagsToUse);
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
        inapplicable: axeResults.inapplicable.map((p) => p.id),
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
    inapplicable: [],
    metadata: {},
  };
}

/**
 * Writes scan progress to a JSON file for real-time UI updates.
 * @param {string} step - Current step identifier.
 * @param {"pending"|"running"|"done"|"error"} status - Step status.
 * @param {Object} [extra={}] - Additional metadata.
 */
/** @type {((step: string, status: string, extra?: object) => void) | null} */
let _onProgressCallback = null;

function writeProgress(step, status, extra = {}) {
  // Notify external callback if set (programmatic API)
  if (_onProgressCallback) {
    _onProgressCallback(step, status, extra);
  }

  // Always write to disk for CLI consumers
  const progressPath = getInternalPath("progress.json");
  let progress = {};
  try {
    if (fs.existsSync(progressPath)) {
      progress = JSON.parse(fs.readFileSync(progressPath, "utf-8"));
    }
  } catch { /* ignore */ }
  progress.steps = progress.steps || {};
  progress.steps[step] = { status, updatedAt: new Date().toISOString(), ...extra };
  progress.currentStep = step;
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

/**
 * Runs CDP (Chrome DevTools Protocol) accessibility checks using Playwright's CDP session.
 * Catches issues axe-core may miss: missing accessible names, broken focus order,
 * aria-hidden on focusable elements, and missing form labels.
 * @param {import("playwright").Page} page - The Playwright page object.
 * @returns {Promise<Object[]>} Array of CDP-sourced violations in axe-compatible format.
 */
async function runCdpChecks(page) {
  const violations = [];
  const interactiveRoles = CDP_CHECKS.interactiveRoles || [];
  const rulesById = {};
  for (const rule of CDP_CHECKS.rules || []) {
    rulesById[rule.condition] = rule;
  }

  try {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");

    for (const node of nodes) {
      const role = node.role?.value || "";
      const name = node.name?.value || "";
      const properties = node.properties || [];
      const ignored = node.ignored || false;

      if (ignored) continue;

      const focusable = properties.find((p) => p.name === "focusable")?.value?.value === true;
      const hidden = properties.find((p) => p.name === "hidden")?.value?.value === true;

      if (interactiveRoles.includes(role) && !name.trim()) {
        const rule = rulesById["interactive-no-name"];
        if (!rule) continue;
        const backendId = node.backendDOMNodeId;
        let selector = "";
        try {
          if (backendId) {
            const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: backendId });
            if (object?.objectId) {
              const result = await cdp.send("Runtime.callFunctionOn", {
                objectId: object.objectId,
                functionDeclaration: `function() {
                  if (this.id) return '#' + this.id;
                  if (this.className && typeof this.className === 'string') return this.tagName.toLowerCase() + '.' + this.className.trim().split(/\\s+/).join('.');
                  return this.tagName.toLowerCase();
                }`,
                returnByValue: true,
              });
              selector = result.result?.value || "";
            }
          }
        } catch { /* fallback: no selector */ }

        const desc = (rule.description || "").replace(/\{\{role\}\}/g, role);
        const msg = (rule.failureMessage || "").replace(/\{\{role\}\}/g, role);
        violations.push({
          id: rule.id,
          impact: rule.impact,
          tags: rule.tags,
          description: desc,
          help: rule.help,
          helpUrl: rule.helpUrl,
          source: "cdp",
          nodes: [{
            any: [],
            all: [{
              id: "cdp-accessible-name",
              data: { role, name: "(empty)" },
              relatedNodes: [],
              impact: rule.impact,
              message: msg,
            }],
            none: [],
            impact: rule.impact,
            html: `<${role} aria-role="${role}">`,
            target: selector ? [selector] : [`[role="${role}"]`],
            failureSummary: `Fix all of the following:\n  ${msg}`,
          }],
        });
      }

      if (hidden && focusable) {
        const rule = rulesById["hidden-focusable"];
        if (!rule) continue;
        const desc = (rule.description || "").replace(/\{\{role\}\}/g, role);
        const msg = (rule.failureMessage || "").replace(/\{\{role\}\}/g, role);
        violations.push({
          id: rule.id,
          impact: rule.impact,
          tags: rule.tags,
          description: desc,
          help: rule.help,
          helpUrl: rule.helpUrl,
          source: "cdp",
          nodes: [{
            any: [],
            all: [{
              id: "cdp-hidden-focusable",
              data: { role },
              relatedNodes: [],
              impact: rule.impact,
              message: msg,
            }],
            none: [],
            impact: rule.impact,
            html: `<element role="${role}" aria-hidden="true">`,
            target: [`[role="${role}"]`],
            failureSummary: `Fix all of the following:\n  ${msg}`,
          }],
        });
      }
    }

    // DOM-eval checks: use page.evaluate() for checks that require direct DOM inspection
    // rather than the accessibility tree.

    // Check: autoplay media (WCAG 1.4.2, 2.2.2)
    try {
      const autoplayMedia = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("video[autoplay], audio[autoplay]"));
        return elements.map((el, index) => ({
          html: el.outerHTML.substring(0, 200),
          selector: el.id
            ? `${el.tagName.toLowerCase()}#${el.id}`
            : `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
        }));
      });

      if (autoplayMedia.length > 0) {
        const rule = CDP_CHECKS.rules.find((r) => r.id === "cdp-autoplay-media");
        if (rule) {
          violations.push({
            id: rule.id,
            impact: rule.impact,
            tags: rule.tags,
            description: `${rule.description} (${autoplayMedia.length} element${autoplayMedia.length > 1 ? "s" : ""} found)`,
            help: rule.help,
            helpUrl: rule.helpUrl,
            source: "cdp",
            nodes: autoplayMedia.map((media) => ({
              any: [],
              all: [{
                id: "cdp-autoplay-media",
                data: { selector: media.selector },
                relatedNodes: [],
                impact: rule.impact,
                message: rule.failureMessage,
              }],
              none: [],
              impact: rule.impact,
              html: media.html,
              target: [media.selector],
              failureSummary: `Fix all of the following:\n  ${rule.failureMessage}`,
            })),
          });
        }
      }
    } catch (err) {
      log.warn(`CDP autoplay-media check failed (non-fatal): ${err.message}`);
    }

    // Check: missing main landmark (WCAG 1.3.1)
    try {
      const hasMainLandmark = await page.evaluate(() => {
        return document.querySelector("main, [role=\"main\"]") !== null;
      });

      if (!hasMainLandmark) {
        const rule = CDP_CHECKS.rules.find((r) => r.id === "cdp-missing-main-landmark");
        if (rule) {
          violations.push({
            id: rule.id,
            impact: rule.impact,
            tags: rule.tags,
            description: rule.description,
            help: rule.help,
            helpUrl: rule.helpUrl,
            source: "cdp",
            nodes: [{
              any: [],
              all: [{
                id: "cdp-missing-main-landmark",
                data: {},
                relatedNodes: [],
                impact: rule.impact,
                message: rule.failureMessage,
              }],
              none: [],
              impact: rule.impact,
              html: "<body>",
              target: ["body"],
              failureSummary: `Fix all of the following:\n  ${rule.failureMessage}`,
            }],
          });
        }
      }
    } catch (err) {
      log.warn(`CDP missing-main-landmark check failed (non-fatal): ${err.message}`);
    }

    // Check: missing skip link (WCAG 2.4.1)
    try {
      const hasSkipLink = await page.evaluate(() => {
        const firstFocusable = document.querySelector("a[href], button, input, select, textarea");
        if (!firstFocusable) return false;
        const href = firstFocusable.getAttribute("href") || "";
        const text = (firstFocusable.textContent || "").toLowerCase();
        return href.startsWith("#") && (text.includes("skip") || text.includes("main") || text.includes("content"));
      });

      if (!hasSkipLink) {
        const rule = CDP_CHECKS.rules.find((r) => r.id === "cdp-missing-skip-link");
        if (rule) {
          violations.push({
            id: rule.id,
            impact: rule.impact,
            tags: rule.tags,
            description: rule.description,
            help: rule.help,
            helpUrl: rule.helpUrl,
            source: "cdp",
            nodes: [{
              any: [],
              all: [{
                id: "cdp-missing-skip-link",
                data: {},
                relatedNodes: [],
                impact: rule.impact,
                message: rule.failureMessage,
              }],
              none: [],
              impact: rule.impact,
              html: "<body>",
              target: ["body"],
              failureSummary: `Fix all of the following:\n  ${rule.failureMessage}`,
            }],
          });
        }
      }
    } catch (err) {
      log.warn(`CDP missing-skip-link check failed (non-fatal): ${err.message}`);
    }

    await cdp.detach();
  } catch (err) {
    log.warn(`CDP checks failed (non-fatal): ${err.message}`);
  }
  return violations;
}

/**
 * Runs pa11y (HTML CodeSniffer) against the already-loaded page URL.
 * Catches WCAG violations that axe-core may miss, particularly around
 * heading hierarchy, link purpose, and form associations.
 * @param {string} routeUrl - The URL to scan.
 * @param {string[]} [axeTags] - WCAG level tags for standard filtering.
 * @returns {Promise<Object[]>} Array of pa11y-sourced violations in axe-compatible format.
 */
/**
 * Runs pa11y (HTML CodeSniffer) against the already-loaded page URL.
 * @param {string} routeUrl - The URL to scan.
 * @param {string[]} [axeTags] - WCAG level tags for standard filtering.
 * @param {import('puppeteer').Browser|null} [sharedBrowser] - Optional shared Puppeteer browser.
 *   When provided, pa11y reuses this instance instead of launching a new Chrome per call.
 *   The browser is NOT closed by this function — the caller is responsible for lifecycle.
 * @returns {Promise<Object[]>} Array of pa11y-sourced violations in axe-compatible format.
 */
async function runPa11yChecks(routeUrl, axeTags, sharedBrowser = null, includeWarnings = false) {
  const violations = [];
  const equivalenceMap = PA11Y_CONFIG.equivalenceMap || {};
  const impactMap = {};
  for (const [k, v] of Object.entries(PA11Y_CONFIG.impactMap || {})) {
    impactMap[Number(k)] = v;
  }

  try {
    let standard = "WCAG2AA";
    if (axeTags) {
      if (axeTags.includes("wcag2aaa")) standard = "WCAG2AAA";
      else if (axeTags.includes("wcag2aa") || axeTags.includes("wcag21aa") || axeTags.includes("wcag22aa")) standard = "WCAG2AA";
      else if (axeTags.includes("wcag2a")) standard = "WCAG2A";
    }

    // Build ignore list with dynamic standard prefix
    const ignoreList = (PA11Y_CONFIG.ignoreByPrinciple || []).map((r) => `${standard}.${r}`);

    const pa11yOptions = {
      standard,
      timeout: 30000,
      wait: 2000,
      ignore: ignoreList,
      includeWarnings: Boolean(includeWarnings),
      includeNotices: false,
    };

    if (sharedBrowser) {
      // Reuse the shared Puppeteer browser — avoids Chrome cold-start per route.
      // pa11y will open a new page, run its checks, and close the page.
      // It will NOT close the browser (autoClose = false when browser is provided).
      pa11yOptions.browser = sharedBrowser;
    } else {
      // Fallback: let pa11y launch its own Chrome (original behavior).
      pa11yOptions.chromeLaunchConfig = {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      };
    }

    const results = await pa11y(routeUrl, pa11yOptions);

    for (const issue of results.issues || []) {
      if (issue.type === "notice") continue;

      const impact = impactMap[issue.typeCode] || "moderate";

      let wcagCriterion = "";
      const wcagMatch = issue.code?.match(/Guideline(\d+)_(\d+)\.(\d+)_(\d+)_(\d+)/);
      if (wcagMatch) {
        wcagCriterion = `${wcagMatch[3]}.${wcagMatch[4]}.${wcagMatch[5]}`;
      }

      // Resolve axe-equivalent rule ID from equivalence map
      const codeWithoutStandard = (issue.code || "").replace(/^WCAG2(A{1,3})\./, "");
      let axeEquivId = null;
      for (const [pattern, axeId] of Object.entries(equivalenceMap)) {
        if (codeWithoutStandard.startsWith(pattern)) {
          axeEquivId = axeId;
          break;
        }
      }

      const ruleId = axeEquivId || `pa11y-${((issue.code || "unknown").split(".").pop() || "unknown").toLowerCase()}`;
      const originalCode = issue.code || "unknown";

      violations.push({
        id: ruleId,
        impact,
        tags: ["pa11y-check", ...(wcagCriterion ? [`wcag${wcagCriterion.replace(/\./g, "")}`] : [])],
        description: issue.message || "pa11y detected an accessibility issue",
        help: issue.message?.split(".")[0] || "Accessibility issue detected by HTML CodeSniffer",
        helpUrl: wcagCriterion
          ? `https://www.w3.org/WAI/WCAG21/Understanding/${wcagCriterion.replace(/\./g, "")}`
          : "https://squizlabs.github.io/HTML_CodeSniffer/",
        source: "pa11y",
        source_rule_id: originalCode,
        nodes: [{
          any: [],
          all: [{
            id: "pa11y-check",
            data: { code: originalCode, context: issue.context?.slice(0, 200) },
            relatedNodes: [],
            impact,
            message: issue.message || "",
          }],
          none: [],
          impact,
          html: issue.context || "",
          target: issue.selector ? [issue.selector] : [],
          failureSummary: `Fix all of the following:\n  ${issue.message || "Accessibility issue"}`,
        }],
      });
    }
  } catch (err) {
    log.warn(`pa11y checks failed (non-fatal): ${err.message}`);
  }
  return violations;
}

/**
 * Merges violations from multiple sources (axe-core, CDP, pa11y) and deduplicates.
 * Deduplication is based on rule ID + first target selector combination.
 * @param {Object[]} axeViolations - Violations from axe-core.
 * @param {Object[]} cdpViolations - Violations from CDP checks.
 * @param {Object[]} pa11yViolations - Violations from pa11y.
 * @returns {Object[]} Merged and deduplicated violations array.
 */
function mergeViolations(axeViolations, cdpViolations, pa11yViolations) {
  const seen = new Set();
  const seenRuleTargets = new Map(); // rule -> Set<target> for cross-engine dedup
  const merged = [];

  // Build CDP equivalence map from JSON config
  const cdpAxeEquiv = {};
  for (const rule of CDP_CHECKS.rules || []) {
    cdpAxeEquiv[rule.id] = rule.axeEquivalents || [];
  }

  // Step 1: axe findings (baseline)
  for (const v of axeViolations) {
    const target = v.nodes?.[0]?.target?.[0] || "";
    const key = `${v.id}::${target}`;
    seen.add(key);
    if (!seenRuleTargets.has(v.id)) seenRuleTargets.set(v.id, new Set());
    seenRuleTargets.get(v.id).add(target);
    merged.push(v);
  }

  // Step 2: CDP findings — check against axe equivalents from JSON
  for (const v of cdpViolations) {
    const equivRules = cdpAxeEquiv[v.id] || [];
    const target = v.nodes?.[0]?.target?.[0] || "";
    const isDuplicate = equivRules.some((r) => seen.has(`${r}::${target}`));
    if (!isDuplicate) {
      const key = `${v.id}::${target}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(v);
      }
    }
  }

  // Step 3: pa11y findings — only skip if same rule + same target already exists
  for (const v of pa11yViolations) {
    const target = v.nodes?.[0]?.target?.[0] || "";
    const key = `${v.id}::${target}`;

    if (!seen.has(key)) {
      seen.add(key);
      if (!seenRuleTargets.has(v.id)) seenRuleTargets.set(v.id, new Set());
      seenRuleTargets.get(v.id).add(target);
      merged.push(v);
    }
  }

  return merged;
}

/**
 * The main execution function for the accessibility scanner.
 * Coordinates browser setup, crawling/discovery, parallel scanning, and result saving.
 * @throws {Error} If navigation to the base URL fails or browser setup issues occur.
 */
/**
 * Runs the DOM scanner programmatically.
 * @param {Object} options - Scanner configuration (same shape as CLI args object).
 * @param {boolean} [options.includeWarnings] - Include pa11y WARNING-level issues (default: false). Automatically enabled when includeIncomplete is true.
 * @param {boolean} [options.includeIncomplete] - Include axe incomplete findings and activates includeWarnings (default: false).
 * @param {{ onProgress?: (step: string, status: string, extra?: object) => void }} [callbacks={}]
 * @returns {Promise<Object>} The scan payload { generated_at, base_url, onlyRule, projectContext, routes }.
 */
export async function runDomScanner(options = {}, callbacks = {}) {
  const args = {
    baseUrl: options.baseUrl || "",
    routes: options.routes || "",
    output: options.output || getInternalPath("a11y-scan-results.json"),
    maxRoutes: options.maxRoutes ?? DEFAULTS.maxRoutes,
    waitMs: options.waitMs ?? DEFAULTS.waitMs,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    headless: options.headless ?? DEFAULTS.headless,
    waitUntil: options.waitUntil ?? DEFAULTS.waitUntil,
    colorScheme: options.colorScheme || null,
    screenshotsDir: options.screenshotsDir || getInternalPath("screenshots"),
    excludeSelectors: options.excludeSelectors || [],
    onlyRule: options.onlyRule || null,
    crawlDepth: Math.min(Math.max(options.crawlDepth ?? DEFAULTS.crawlDepth, 1), 3),
    viewport: options.viewport || null,
    axeTags: options.axeTags || null,
    projectDir: options.projectDir || null,
    remotePackageJson: options.remotePackageJson || null,
    engines: {
      axe: options.engines?.axe !== false,
      cdp: options.engines?.cdp !== false,
      pa11y: options.engines?.pa11y !== false,
    },
    includeWarnings: options.includeWarnings ?? options.includeIncomplete ?? false,
    clearCache: options.clearCache ?? false,
    serverMode: options.serverMode ?? false,
  };

  if (!args.baseUrl) throw new Error("Missing required option: baseUrl");

  if (callbacks.onProgress) {
    _onProgressCallback = callbacks.onProgress;
  }

  try {
    return await _runDomScannerInternal(args);
  } finally {
    _onProgressCallback = null;
  }
}

async function _runDomScannerInternal(args) {
  const baseUrl = new URL(args.baseUrl).toString();
  const origin = new URL(baseUrl).origin;

  log.info(`Starting accessibility audit for ${baseUrl}`);

  const primaryViewport = args.viewport || {
    width: DEFAULTS.viewports[0].width,
    height: DEFAULTS.viewports[0].height,
  };

  // Server/EC2 Chrome flags — prevents crashes in Docker and headless server environments.
  // Equivalent to the flags used by @wondersauce/a11y-scanner in AI-11y.
  const serverArgs = args.serverMode
    ? [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-accelerated-2d-canvas",
      ]
    : [];

  const browser = await chromium.launch({
    headless: args.headless,
    args: serverArgs,
  });
  const context = await browser.newContext({
    viewport: primaryViewport,
    reducedMotion: "no-preference",
    colorScheme: args.colorScheme || DEFAULTS.colorScheme,
    forcedColors: "none",
    locale: "en-US",
  });
  const page = await context.newPage();

  // Shared Puppeteer browser for pa11y — launched once, reused for all routes.
  // Eliminates Chrome cold-start overhead (1-3s) per route.
  // Falls back to per-route launch if puppeteer is unavailable.
  let pa11yBrowser = null;
  if (args.engines?.pa11y !== false) {
    try {
      pa11yBrowser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      log.info("pa11y: shared Puppeteer browser ready");
    } catch (err) {
      log.warn(`pa11y: shared browser launch failed (non-fatal), will launch per-route: ${err.message}`);
      pa11yBrowser = null;
    }
  }

  let routes = [];
  let projectContext = { framework: null, cms: null, uiLibraries: [] };
  try {
    await page.goto(baseUrl, {
      waitUntil: args.waitUntil,
      timeout: args.timeoutMs,
    });

    // 1. File-system / package.json detection (local projectDir) or remote package.json
    const repoCtx = detectProjectContext(args.projectDir || null, args.remotePackageJson || null);

    // 2. DOM/runtime detection (always works for any remote URL)
    let domCtx = { framework: null, cms: null, uiLibraries: [] };
    try {
      domCtx = await detectProjectContextFromDom(page);
    } catch (err) {
      log.warn(`DOM stack detection failed (non-fatal): ${err.message}`);
    }

    // 3. Merge: repo detection takes priority, DOM fills gaps
    projectContext = {
      framework: repoCtx.framework || domCtx.framework || null,
      cms: domCtx.cms || null,
      uiLibraries: [...new Set([
        ...(repoCtx.uiLibraries || []),
        ...(domCtx.uiLibraries || []),
      ])],
    };

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
    throw new Error(`Could not load base URL ${baseUrl}: ${err.message}`);
  }

  /**
   * Selectors that should never be targeted for element screenshots.
   * @type {Set<string>}
   */
  const SKIP_SELECTORS = new Set(["html", "body", "head", ":root", "document"]);
  const SKIP_SELECTOR_PREFIXES = ["meta", "link", "style", "script", "title", "base"];

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
    const lowerSelector = (selector || "").toLowerCase();
    if (!selector || SKIP_SELECTORS.has(lowerSelector)) return;
    if (SKIP_SELECTOR_PREFIXES.some((p) => lowerSelector.startsWith(p))) return;
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

    writeProgress("page", "running");

    // Track which steps have already emitted "done" so multi-route scans
    // don't reset progress back to "running" for routes after the first.
    const emittedDone = new Set();

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

            if (!emittedDone.has("page")) {
              writeProgress("page", "done");
              emittedDone.add("page");
            }

            let result = { url: targetUrl, violations: [], incomplete: [], passes: [], inapplicable: [], metadata: {} };
            let cdpViolations = [];
            let pa11yViolations = [];

            // pa11y is fully independent (own browser, receives only URL string).
            // Start it in parallel with the axe→CDP sequence to hide its latency.
            // axe and CDP must remain sequential: CDP depends on axe's page navigation.
            let pa11yPromise = Promise.resolve([]);
            if (args.engines.pa11y) {
              if (!emittedDone.has("pa11y")) writeProgress("pa11y", "running");
              pa11yPromise = runPa11yChecks(targetUrl, args.axeTags, pa11yBrowser, args.includeWarnings)
                .then((violations) => {
                  if (!emittedDone.has("pa11y")) {
                    writeProgress("pa11y", "done", { found: violations.length });
                    emittedDone.add("pa11y");
                  }
                  log.info(`pa11y: ${violations.length} issue(s) found`);
                  return violations;
                });
            } else {
              log.info("pa11y: skipped (disabled)");
            }

            // Step 1: axe-core (conditional)
            if (args.engines.axe) {
              if (!emittedDone.has("axe")) writeProgress("axe", "running");
              result = await analyzeRoute(
                tabPage,
                targetUrl,
                args.waitMs,
                args.excludeSelectors,
                args.onlyRule,
                args.timeoutMs,
                2,
                args.waitUntil,
                args.axeTags,
                args.clearCache || false,
              );
              const axeViolationCount = result.violations?.length || 0;
              if (!emittedDone.has("axe")) {
                writeProgress("axe", "done", { found: axeViolationCount });
                emittedDone.add("axe");
              }
              log.info(`axe-core: ${axeViolationCount} violation(s) found`);
            } else {
              // Navigate for CDP even if axe is off
              if (args.clearCache) {
                const cdpClient = await tabPage.context().newCDPSession(tabPage);
                await cdpClient.send("Network.clearBrowserCache");
                await cdpClient.send("Network.setCacheDisabled", { cacheDisabled: true });
                await cdpClient.detach();
              }
              await tabPage.goto(targetUrl, { waitUntil: args.waitUntil, timeout: args.timeoutMs });
              await tabPage.waitForLoadState("networkidle", { timeout: args.waitMs }).catch(() => {});
              result.metadata = await tabPage.evaluate(() => ({ title: document.title }));
              log.info("axe-core: skipped (disabled)");
            }

            // Step 2: CDP checks (conditional) — sequential after axe (shares tabPage)
            if (args.engines.cdp) {
              if (!emittedDone.has("cdp")) writeProgress("cdp", "running");
              cdpViolations = await runCdpChecks(tabPage);
              if (!emittedDone.has("cdp")) {
                writeProgress("cdp", "done", { found: cdpViolations.length });
                emittedDone.add("cdp");
              }
              log.info(`CDP checks: ${cdpViolations.length} issue(s) found`);
            } else {
              log.info("CDP checks: skipped (disabled)");
            }

            // Step 3: Await pa11y (started in parallel before axe — may already be done)
            pa11yViolations = await pa11yPromise;

            // Step 4: Merge results
            const axeViolationCount = result.violations?.length || 0;
            if (!emittedDone.has("merge")) writeProgress("merge", "running");
            const mergedViolations = mergeViolations(
              result.violations || [],
              cdpViolations,
              pa11yViolations,
            );
            if (!emittedDone.has("merge")) {
              writeProgress("merge", "done", {
                axe: axeViolationCount,
                cdp: cdpViolations.length,
                pa11y: pa11yViolations.length,
                merged: mergedViolations.length,
              });
              emittedDone.add("merge");
            }
            log.info(`Merged: ${mergedViolations.length} total unique violations (axe: ${axeViolationCount}, cdp: ${cdpViolations.length}, pa11y: ${pa11yViolations.length})`);

            // Screenshots for merged violations
            if (args.screenshotsDir && mergedViolations) {
              for (const violation of mergedViolations) {
                await captureElementScreenshot(tabPage, violation, idx);
              }
            }
            results[idx] = {
              path: routePath,
              ...result,
              violations: mergedViolations,
              incomplete: result.incomplete || [],
            };
          })(),
        );
      }
      await Promise.all(batch);
    }
  } finally {
    await browser.close();
    if (pa11yBrowser) {
      await pa11yBrowser.close().catch((err) =>
        log.warn(`pa11y browser close failed (non-fatal): ${err.message}`),
      );
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    onlyRule: args.onlyRule || null,
    engines: args.engines,
    axeTags: args.axeTags || null,
    projectContext,
    routes: results,
  };

  writeJson(args.output, payload);
  log.success(`Routes scan complete. Results saved to ${args.output}`);

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runDomScanner(args);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    log.error(`Scanner Execution Error: ${error.message}`);
    process.exit(1);
  });
}
