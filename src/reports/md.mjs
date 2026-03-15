/**
 * @file report-md.mjs
 * @description Generates a Markdown-based remediation guide and audit summary.
 * This report is optimized for developers and intended to be used as a
 * backlog or README-style remediation roadmap.
 */

import { readJson, log, getInternalPath, DEFAULTS } from "../core/utils.mjs";
import fs from "node:fs";
import path from "node:path";
import { normalizeFindings } from "./renderers/findings.mjs";
import { buildMarkdownSummary } from "./renderers/md.mjs";

/**
 * Prints the CLI usage instructions and available options for the Markdown report builder.
 */
function printUsage() {
  log.info(`Usage:
  node report-md.mjs [options]

Options:
  --input <path>           Findings JSON path (default: internal)
  --output <path>          Output Markdown path (default: internal)
  --base-url <url>         Target website URL
  --target <text>          Compliance target label (default: WCAG 2.2 AA)
  -h, --help               Show this help
`);
}

/**
 * Parses command-line arguments into a configuration object for the Markdown builder.
 * @param {string[]} argv - Array of command-line arguments.
 * @returns {Object} A configuration object containing input, output, and target settings.
 */
function parseArgs(argv) {
  const args = {
    input: getInternalPath("a11y-findings.json"),
    output: getInternalPath("remediation.md"),
    baseUrl: "",
    target: DEFAULTS.complianceTarget,
    framework: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--help" || key === "-h") {
      printUsage();
      process.exit(0);
    }
    if (!key.startsWith("--") || value === undefined) continue;

    if (key === "--input") args.input = value;
    if (key === "--output") args.output = value;
    if (key === "--base-url") args.baseUrl = value;
    if (key === "--target") args.target = value;
    i += 1;
  }

  return args;
}

/**
 * The main execution function for the Markdown report builder.
 * Reads scan results, generates the Markdown string, and writes the output file.
 * @throws {Error} If the input findings file is missing or invalid.
 */
function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPayload = readJson(args.input);
  if (!inputPayload) {
    throw new Error(`Input findings file not found or invalid: ${args.input}`);
  }

  const patternInput = getInternalPath("a11y-pattern-findings.json");
  const patternPayload = fs.existsSync(patternInput) ? readJson(patternInput) : null;

  const findings = normalizeFindings(inputPayload);
  const md = buildMarkdownSummary(args, findings, {
    ...inputPayload.metadata,
    incomplete_findings: inputPayload.incomplete_findings,
    pattern_findings: patternPayload,
  });

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, md, "utf-8");

  log.success(`Remediation guide written to ${args.output}`);
}

try {
  main();
} catch (error) {
  log.error(`Markdown Generation Error: ${error.message}`);
  process.exit(1);
}
