/**
 * @file source-scanner.mjs
 * @description Source code pattern scanner for accessibility issues not detectable by axe-core.
 * Runs regex-based patterns from code-patterns.json against the project source tree
 * and outputs structured findings compatible with the a11y pipeline.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { log, writeJson, getInternalPath } from "../core/utils.mjs";
import { ASSET_PATHS, loadAssetJson } from "../core/asset-loader.mjs";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  ".cache", "coverage", ".audit", "out", ".turbo", ".svelte-kit",
  ".vercel", ".netlify", "public", "static",
  "wp-includes", "wp-admin",
]);

const SKIP_FILE_PATTERN = /\.min\.(js|css)$/i;

const SOURCE_BOUNDARIES = loadAssetJson(
  ASSET_PATHS.remediation.sourceBoundaries,
  "assets/remediation/source-boundaries.json",
);

function printUsage() {
  log.info(`Usage:
  node scripts/engine/source-scanner.mjs --project-dir <path> [options]

Options:
  --project-dir <path>    Path to the project source root to scan (required)
  --output <path>         Output JSON path (default: internal .audit/a11y-pattern-findings.json)
  --only-pattern <id>     Only run a specific pattern ID
  -h, --help              Show this help
`);
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const args = {
    projectDir: null,
    framework: null,
    output: getInternalPath("a11y-pattern-findings.json"),
    onlyPattern: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (key === "--project-dir") args.projectDir = value;
    if (key === "--framework") args.framework = value;
    if (key === "--output") args.output = value;
    if (key === "--only-pattern") args.onlyPattern = value;
    i++;
  }

  if (!args.projectDir) throw new Error("Missing required --project-dir");
  return args;
}

/**
 * Extracts file extensions from glob patterns like "**\/*.tsx".
 * @param {string[]} globs
 * @returns {Set<string>}
 */
export function parseExtensions(globs) {
  const exts = new Set();
  for (const glob of globs) {
    const match = glob.trim().match(/\*\.(\w+)$/);
    if (match) exts.add(`.${match[1]}`);
  }
  return exts;
}

/**
 * Recursively walks a directory and collects files matching the given extensions.
 * @param {string} dir
 * @param {Set<string>} extensions
 * @param {string[]} results
 * @returns {string[]}
 */
function walkFiles(dir, extensions, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walkFiles(join(dir, entry.name), extensions, results);
    } else if (entry.isFile() && extensions.has(extname(entry.name)) && !SKIP_FILE_PATTERN.test(entry.name)) {
      results.push(join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Resolves the directories to scan based on framework source boundaries.
 * Falls back to the full project dir if no boundaries are defined.
 * @param {string|null} framework
 * @param {string} projectDir
 * @returns {string[]}
 */
function resolveScanDirs(framework, projectDir) {
  const boundaries = framework ? SOURCE_BOUNDARIES?.[framework] : null;
  if (!boundaries) return [projectDir];

  const allGlobs = [boundaries.components, boundaries.styles]
    .filter(Boolean)
    .flatMap((g) => g.split(",").map((s) => s.trim()));

  const prefixes = new Set();
  for (const glob of allGlobs) {
    const prefix = glob.split(/[*?{]/)[0].replace(/\/$/, "");
    if (prefix) prefixes.add(prefix);
  }

  const dirs = [...prefixes]
    .map((p) => resolve(projectDir, p))
    .filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });

  const deduped = dirs.filter((d) =>
    !dirs.some((other) => other !== d && d.startsWith(other + "/"))
  );

  return deduped.length > 0 ? deduped : [projectDir];
}

/**
 * Generates a stable ID for a pattern finding based on pattern ID, file, and line number.
 * @param {string} patternId
 * @param {string} file
 * @param {number} line
 * @returns {string}
 */
export function makeFindingId(patternId, file, line) {
  const key = `${patternId}||${file}||${line}`;
  return `PAT-${createHash("sha256").update(key).digest("hex").slice(0, 6)}`;
}

/**
 * Applies context validation for patterns that require manual verification.
 * Returns true (confirmed violation) if the context does NOT contain a resolution.
 * @param {Object} pattern
 * @param {string[]} lines
 * @param {number} lineIndex
 * @returns {boolean}
 */
export function isConfirmedByContext(pattern, lines, lineIndex) {
  if (!pattern.requires_manual_verification || !pattern.context_reject_regex) return true;

  const window = pattern.context_window || 5;
  const start = Math.max(0, lineIndex - window);
  const end = Math.min(lines.length - 1, lineIndex + window);
  const nearby = lines.slice(start, end + 1).join("\n");

  const rejectRe = new RegExp(pattern.context_reject_regex, "i");
  return !rejectRe.test(nearby);
}

/**
 * Scans all files matching a pattern's globs for regex matches.
 * @param {Object} pattern
 * @param {string} scanDir - Directory to walk (may be a sub-directory of projectDir).
 * @param {string} [projectDir] - Root used for relative file paths (defaults to scanDir).
 * @returns {Object[]}
 */
export function scanPattern(pattern, scanDir, projectDir = scanDir) {
  const findings = [];
  const extensions = parseExtensions(pattern.globs);
  const files = walkFiles(scanDir, extensions);
  const regex = new RegExp(pattern.regex, "gi");

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (!regex.test(lines[i])) continue;

      const contextStart = Math.max(0, i - 3);
      const contextEnd = Math.min(lines.length - 1, i + 3);
      const context = lines
        .slice(contextStart, contextEnd + 1)
        .map((l, idx) => `${contextStart + idx + 1}  ${l}`)
        .join("\n");

      const confirmed = isConfirmedByContext(pattern, lines, i);
      const relFile = relative(projectDir, file);

      findings.push({
        id: makeFindingId(pattern.id, relFile, i + 1),
        pattern_id: pattern.id,
        title: pattern.title,
        severity: pattern.severity,
        wcag: pattern.wcag,
        wcag_criterion: pattern.wcag_criterion,
        wcag_level: pattern.wcag_level,
        type: pattern.type,
        fix_description: pattern.fix_description ?? null,
        status: confirmed ? "confirmed" : "potential",
        file: relFile,
        line: i + 1,
        match: lines[i].trim(),
        context,
        source: "code-pattern",
      });
    }
  }

  return findings;
}

/**
 * Main execution function for the pattern scanner.
 */
function main() {
  const args = parseArgs(process.argv.slice(2));
  const { patterns } = loadAssetJson(
    ASSET_PATHS.remediation.codePatterns,
    "assets/remediation/code-patterns.json",
  );

  const activePatterns = args.onlyPattern
    ? patterns.filter((p) => p.id === args.onlyPattern)
    : patterns;

  if (activePatterns.length === 0) {
    log.warn(args.onlyPattern
      ? `Pattern "${args.onlyPattern}" not found in code-patterns.json`
      : "No patterns defined in code-patterns.json"
    );
    process.exit(0);
  }

  const scanDirs = resolveScanDirs(args.framework, args.projectDir);
  log.info(`Scanning source code at: ${args.projectDir}`);
  if (scanDirs.length > 1 || scanDirs[0] !== args.projectDir) {
    log.info(`  Scoped to: ${scanDirs.map((d) => relative(args.projectDir, d)).join(", ")}`);
  }
  log.info(`Running ${activePatterns.length} pattern(s)...`);

  const allFindings = [];
  for (const pattern of activePatterns) {
    const findings = [];
    for (const scanDir of scanDirs) {
      findings.push(...scanPattern(pattern, scanDir, args.projectDir));
    }
    if (findings.length > 0) {
      log.info(`  ${pattern.id}: ${findings.length} match(es)`);
    }
    allFindings.push(...findings);
  }

  const confirmed = allFindings.filter((f) => f.status === "confirmed").length;
  const potential = allFindings.filter((f) => f.status === "potential").length;

  writeJson(args.output, {
    generated_at: new Date().toISOString(),
    project_dir: args.projectDir,
    findings: allFindings,
    summary: {
      total: allFindings.length,
      confirmed,
      potential,
    },
  });

  log.success(
    `Pattern scan complete. ${confirmed} confirmed, ${potential} potential. Saved to ${args.output}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}
