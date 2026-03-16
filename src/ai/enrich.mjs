#!/usr/bin/env node
/**
 * @file enrich.mjs
 * @description CLI script that reads a11y-findings.json, enriches Critical/Serious
 * findings using the Claude AI module, and writes the result back.
 * Runs as a child process from audit.mjs after the analyzer step.
 */

import { fileURLToPath } from "node:url";
import { log, getInternalPath, writeJson } from "../core/utils.mjs";
import { enrichWithAI } from "./claude.mjs";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.warn("No ANTHROPIC_API_KEY found — skipping AI enrichment.");
    process.exit(0);
  }

  const findingsPath = getInternalPath("a11y-findings.json");

  let payload;
  try {
    const { readFileSync } = await import("node:fs");
    payload = JSON.parse(readFileSync(findingsPath, "utf-8"));
  } catch (err) {
    log.warn(`Could not read findings file — skipping AI enrichment: ${err.message}`);
    process.exit(0);
  }

  const findings = payload.findings ?? [];
  if (findings.length === 0) {
    log.info("No findings to enrich.");
    process.exit(0);
  }

  const stack = payload.metadata?.projectContext ?? {};
  const repoUrl = process.env.A11Y_REPO_URL || payload.metadata?.repoUrl || null;
  const githubToken = process.env.GH_TOKEN || undefined;

  log.info(`AI enrichment: processing up to 20 Critical/Serious findings...`);

  const systemPrompt = process.env.AI_SYSTEM_PROMPT || null;

  const enriched = await enrichWithAI(findings, { stack, repoUrl }, {
    enabled: true,
    apiKey,
    githubToken,
    ...(systemPrompt ? { systemPrompt } : {}),
  });

  const enrichedWithFlag = enriched.map((f, i) => {
    const original = findings[i];
    const wasImproved = original && (
      f.fixDescription !== original.fixDescription ||
      f.fixCode !== original.fixCode
    );
    if (!wasImproved) return f;
    return {
      ...original,
      aiEnhanced: true,
      ai_fix_description: f.fixDescription || null,
      ai_fix_code: f.fixCode || null,
      ai_fix_code_lang: f.fixCodeLang || null,
    };
  });

  writeJson(findingsPath, { ...payload, findings: enrichedWithFlag });

  const improved = enrichedWithFlag.filter((f) => f.aiEnhanced).length;
  log.success(`AI enrichment complete. ${improved} finding(s) improved.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    log.warn(`AI enrichment failed (non-fatal): ${err.message}`);
    process.exit(0);
  });
}
