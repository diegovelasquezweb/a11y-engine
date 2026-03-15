/**
 * @file report-pdf.mjs
 * @description Generates a professional PDF audit report using Playwright.
 * It renders an internal HTML template optimized for print and exports it
 * as a formal A4 accessibility compliance document.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { readJson, log, getInternalPath, DEFAULTS } from "../core/utils.mjs";
import {
  normalizeFindings,
  buildSummary,
  computeComplianceScore,
  wcagOverallStatus,
} from "./renderers/findings.mjs";
import {
  scoreMetrics,
  buildPdfTableOfContents,
  buildPdfExecutiveSummary,
  buildPdfRiskSection,
  buildPdfRemediationRoadmap,
  buildPdfMethodologySection,
  buildPdfIssueSummaryTable,
  buildPdfNextSteps,
  buildPdfAuditLimitations,
  buildPdfCoverPage,
} from "./renderers/pdf.mjs";

/**
 * Prints the CLI usage instructions and available options for the PDF report builder.
 */
function printUsage() {
  log.info(`Usage:
  node report-pdf.mjs [options]

Options:
  --input <path>           Findings JSON path (default: internal)
  --output <path>          Output PDF path (required)
  --base-url <url>         Target website URL
  --target <text>          Compliance target label (default: WCAG 2.2 AA)
  -h, --help               Show this help
`);
}

/**
 * Parses command-line arguments into a configuration object for the PDF builder.
 * @param {string[]} argv - Array of command-line arguments.
 * @returns {Object} A configuration object containing input, output, and target settings.
 */
function parseArgs(argv) {
  const args = {
    input: getInternalPath("a11y-findings.json"),
    output: "",
    baseUrl: "",
    target: DEFAULTS.complianceTarget,
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
 * Constructs the HTML structure specifically tailored for PDF rendering.
 * @param {Object} args - The parsed CLI arguments.
 * @param {Object[]} findings - The normalized list of audit findings.
 * @returns {string} The HTML document string fully prepared for PDF export.
 */
function buildPdfHtml(args, findings) {
  const totals = buildSummary(findings);
  const score = computeComplianceScore(totals);

  let siteHostname = args.baseUrl;
  try {
    siteHostname = new URL(
      args.baseUrl.startsWith("http")
        ? args.baseUrl
        : `https://${args.baseUrl}`,
    ).hostname;
  } catch {}

  const coverDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Accessibility Audit — ${siteHostname}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 2cm; }

    body {
      background: white;
      color: black;
      font-family: 'Libre Baskerville', serif;
      font-size: 11pt;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }

    h1, h2, h3, h4 {
      font-family: 'Inter', sans-serif;
      color: black;
      margin-top: 1.5rem;
      margin-bottom: 1rem;
    }

    .cover-page {
      height: 25.5cm;
      display: flex;
      flex-direction: column;
      page-break-after: always;
    }

    .finding-entry {
      border-top: 1pt solid black;
      padding-top: 1.5rem;
      margin-top: 2rem;
      page-break-inside: avoid;
    }

    .severity-tag {
      font-weight: 800;
      text-transform: uppercase;
      border: 1.5pt solid black;
      padding: 2pt 6pt;
      font-size: 9pt;
      margin-bottom: 1rem;
      display: inline-block;
    }

    .remediation-box {
      background-color: #f3f4f6;
      border-left: 4pt solid black;
      padding: 1rem;
      margin: 1rem 0;
      font-style: italic;
    }

    pre {
      background: #f9fafb;
      border: 1pt solid #ddd;
      padding: 10pt;
      font-size: 8pt;
      overflow: hidden;
      white-space: pre-wrap;
    }

    .stats-table {
      width: 100%;
      border-collapse: collapse;
      margin: 2rem 0;
    }
    .stats-table th, .stats-table td {
      border: 1pt solid black;
      padding: 10pt;
      text-align: left;
      font-size: 9pt;
      font-family: 'Inter', sans-serif;
    }
  </style>
</head>
<body>
  ${buildPdfCoverPage({ siteHostname, target: args.target, score, wcagStatus: wcagOverallStatus(totals), coverDate })}
  ${buildPdfTableOfContents()}
  ${buildPdfExecutiveSummary(args, findings, totals)}
  ${buildPdfRiskSection(totals)}
  ${buildPdfRemediationRoadmap(findings)}
  ${buildPdfMethodologySection(args, findings)}
  ${buildPdfIssueSummaryTable(findings)}
  ${buildPdfNextSteps(findings, totals)}
  ${buildPdfAuditLimitations()}
</body>
</html>`;
}

/**
 * The main execution function for the PDF report builder.
 * Uses a headless browser (Playwright) to render the report and save it as a PDF file.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) {
    log.error("Missing required --output flag for PDF report location.");
    process.exit(1);
  }

  const inputPayload = readJson(args.input);
  if (!inputPayload) {
    log.error(`Input findings file not found or invalid: ${args.input}`);
    process.exit(1);
  }

  const findings = normalizeFindings(inputPayload).filter(
    (f) => f.wcagClassification !== "AAA" && f.wcagClassification !== "Best Practice",
  );
  const html = buildPdfHtml(args, findings);

  log.info("Generating professional PDF report...");

  fs.mkdirSync(path.dirname(args.output), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    await page.pdf({
      path: args.output,
      format: "A4",
      printBackground: true,
      margin: {
        top: "1cm",
        right: "1cm",
        bottom: "1cm",
        left: "1cm",
      },
      displayHeaderFooter: false,
    });

    log.success(`PDF report generated successfully: ${args.output}`);
  } catch (error) {
    log.error(`Failed to generate PDF: ${error.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  log.error(`Unhandled PDF Generation Error: ${error.message}`);
  process.exit(1);
});
