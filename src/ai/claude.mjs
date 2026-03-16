/**
 * @file claude.mjs
 * @description Claude AI enrichment layer for the a11y-engine.
 * Enhances Critical/Serious findings with context-aware fix suggestions,
 * leveraging repository source code when available via GitHub API.
 *
 * This module is a passthrough when:
 * - options.enabled is false
 * - no apiKey is provided
 *
 * Requires: ANTHROPIC_API_KEY in options.apiKey
 * Optional: githubToken for reading private repo files
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_AI_FINDINGS = 20; // cap to control cost

/**
 * @typedef {import('../index.d.mts').EnrichedFinding} EnrichedFinding
 */

/**
 * Builds the system prompt for the AI enrichment task.
 * @param {object} context
 * @returns {string}
 */
export const DEFAULT_AI_SYSTEM_PROMPT = `You are an expert web accessibility engineer specializing in WCAG 2.2 AA remediation.

Your task is to provide a developer-friendly AI hint for each accessibility finding — something MORE USEFUL than the generic automated fix already provided.

For each finding, provide:
1. fixDescription: A 2-3 sentence explanation that goes BEYOND the generic fix. Explain WHY this matters for real users, WHAT specifically to look for in the codebase, and HOW to verify the fix works. Be specific to the selector and actual violation data provided.
2. fixCode: A ready-to-use, production-quality code snippet in the correct syntax for the stack. Do NOT copy the existing fix code — write a BETTER, more complete example that a developer can use directly.

Rules:
- Your fixDescription must add new insight not present in currentFix — don't paraphrase it
- Your fixCode must be different and more complete than currentCode
- Use framework-specific syntax (JSX/TSX for React/Next.js, SFC for Vue, etc.)
- Reference the actual selector or element from the finding when possible
- If the violation data contains specific values (colors, ratios, labels), use them in your response
- Respond in JSON only — no markdown, no explanation outside the JSON structure`;

export const PM_AI_SYSTEM_PROMPT = `You are an accessibility compliance advisor for product managers and non-technical stakeholders.

Your task is to provide a business-oriented summary for each accessibility finding — something a PM can use to prioritize, communicate to stakeholders, and plan sprints.

For each finding, provide:
1. pmSummary: A single sentence describing who is affected and what they cannot do. Use plain language, no technical jargon.
2. pmImpact: 2-3 sentences on business consequences: legal/compliance risk, user segments blocked, effect on conversions/engagement/SEO. Be specific to the violation.
3. pmEffort: One of "quick-win", "medium", or "strategic" with a brief time estimate (e.g., "quick-win — under 1 hour per instance").

Rules:
- Write for a non-technical audience — no code, no selectors, no ARIA terminology
- Focus on users affected, business risk, and prioritization
- Reference the actual violation data (title, severity, affected users) to be specific
- Respond in JSON only — no markdown, no explanation outside the JSON structure`;

function buildSystemPrompt(context) {
  const { framework, cms, uiLibraries } = context.stack || {};

  let stackInfo = "";
  if (framework) stackInfo += `Framework: ${framework}\n`;
  if (cms) stackInfo += `CMS: ${cms}\n`;
  if (uiLibraries?.length) stackInfo += `UI Libraries: ${uiLibraries.join(", ")}\n`;

  const base = DEFAULT_AI_SYSTEM_PROMPT;
  return stackInfo ? base.replace(
    "For each finding, provide:",
    `Project context:\n${stackInfo}\nFor each finding, provide:`
  ) : base;
}

/**
 * Builds the user message for a batch of findings.
 * @param {EnrichedFinding[]} findings
 * @param {Record<string, string>} sourceFiles - map of filePath -> content
 * @returns {string}
 */
function buildUserMessage(findings, sourceFiles) {
  const items = findings.map((f, i) => ({
    index: i,
    ruleId: f.ruleId,
    severity: f.severity,
    wcag: f.wcag,
    title: f.title,
    selector: f.primarySelector || f.selector,
    actual: f.actual,
    currentFix: f.fixDescription,
    currentCode: f.fixCode,
    fileSearchPattern: f.fileSearchPattern || null,
  }));

  let message = `Improve the fix guidance for these ${findings.length} accessibility finding(s).\n\n`;
  message += `FINDINGS:\n${JSON.stringify(items, null, 2)}\n`;

  if (Object.keys(sourceFiles).length > 0) {
    message += `\nSOURCE FILES (for context):\n`;
    for (const [filePath, content] of Object.entries(sourceFiles)) {
      const truncated = content.length > 4000 ? content.slice(0, 4000) + "\n... (truncated)" : content;
      message += `\n--- ${filePath} ---\n${truncated}\n`;
    }
  }

  message += `\nRespond with a JSON array where each item has:
{
  "index": <number>,
  "fixDescription": "<improved description>",
  "fixCode": "<improved code snippet>",
  "fixCodeLang": "<language: html|jsx|tsx|vue|svelte|astro|liquid|php|css>"
}`;

  return message;
}

/**
 * Builds the user message for PM audience.
 * @param {EnrichedFinding[]} findings
 * @returns {string}
 */
function buildPmUserMessage(findings) {
  const items = findings.map((f, i) => ({
    index: i,
    title: f.title,
    severity: f.severity,
    wcag: f.wcag,
    impactedUsers: f.impactedUsers,
    currentPmSummary: f.pmSummary,
    currentPmImpact: f.pmImpact,
    totalInstances: f.totalInstances,
    pagesAffected: f.pagesAffected,
  }));

  let message = `Improve the PM-facing guidance for these ${findings.length} accessibility finding(s).\n\n`;
  message += `FINDINGS:\n${JSON.stringify(items, null, 2)}\n`;
  message += `\nRespond with a JSON array where each item has:\n`;
  message += `{
  "index": <number>,
  "pmSummary": "<one-line business impact>",
  "pmImpact": "<2-3 sentences on business/legal/UX consequences>",
  "pmEffort": "<quick-win|medium|strategic with time estimate>"
}`;

  return message;
}

/**
 * Calls the Claude API with the given messages.
 * @param {string} apiKey
 * @param {string} model
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function callClaude(apiKey, model, systemPrompt, userMessage) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

/**
 * Tries to fetch source files for findings that have a fileSearchPattern.
 * @param {EnrichedFinding[]} findings
 * @param {string} repoUrl
 * @param {string|undefined} githubToken
 * @returns {Promise<Record<string, string>>}
 */
/**
 * Extracts candidate component/class names from a CSS selector or HTML snippet.
 * e.g. ".trustarc-banner-right > span" → ["trustarc", "banner"]
 * e.g. "#search-input" → ["search", "input"]
 */
function extractSearchTermsFromFinding(finding) {
  const terms = new Set();
  const sources = [
    finding.primarySelector || finding.selector || "",
    finding.title || "",
  ];

  for (const src of sources) {
    // Extract class names: .foo-bar → ["foo", "bar"]
    const classes = src.match(/\.[\w-]+/g) || [];
    for (const cls of classes) {
      const parts = cls.slice(1).split(/[-_]/);
      for (const p of parts) {
        if (p.length > 3) terms.add(p.toLowerCase());
      }
    }
    // Extract IDs: #foo-bar → ["foo", "bar"]
    const ids = src.match(/#[\w-]+/g) || [];
    for (const id of ids) {
      const parts = id.slice(1).split(/[-_]/);
      for (const p of parts) {
        if (p.length > 3) terms.add(p.toLowerCase());
      }
    }
    // Extract data attributes: [data-component="Foo"] → ["foo"]
    const dataAttrs = src.match(/data-[\w-]+=["']?[\w-]+["']?/g) || [];
    for (const attr of dataAttrs) {
      const val = attr.split(/=["']?/)[1]?.replace(/["']/, "").toLowerCase();
      if (val && val.length > 3) terms.add(val);
    }
  }

  return [...terms].slice(0, 5);
}

/**
 * Scores a file path by how many search terms it contains.
 */
function scoreFilePath(filePath, terms) {
  const lower = filePath.toLowerCase();
  return terms.filter((t) => lower.includes(t)).length;
}

async function fetchSourceFilesForFindings(findings, repoUrl, githubToken) {
  const sourceFiles = {};
  if (!repoUrl) return sourceFiles;

  const { fetchRepoFile, listRepoFiles, parseRepoUrl } = await import("../core/github-api.mjs");
  if (!parseRepoUrl(repoUrl)) return sourceFiles;

  // Collect all extensions needed
  const extensions = new Set();
  for (const f of findings) {
    if (!f.fileSearchPattern) continue;
    const extMatch = f.fileSearchPattern.match(/\*\.(\w+)$/);
    if (extMatch) extensions.add(`.${extMatch[1]}`);
  }
  if (extensions.size === 0) return sourceFiles;

  // Fetch full file list once
  let allFiles = [];
  try {
    allFiles = await listRepoFiles(repoUrl, [...extensions], githubToken);
  } catch {
    return sourceFiles;
  }

  // For each finding, find the most relevant files by selector/title terms
  const MAX_FILES_PER_FINDING = 2;
  const MAX_TOTAL_FILES = 6;

  for (const finding of findings) {
    if (Object.keys(sourceFiles).length >= MAX_TOTAL_FILES) break;

    const terms = extractSearchTermsFromFinding(finding);

    // Score and sort files by relevance to this finding
    const scored = allFiles
      .map((fp) => ({ fp, score: scoreFilePath(fp, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    // Fall back to first files if no relevant match found
    const candidates = scored.length > 0
      ? scored.slice(0, MAX_FILES_PER_FINDING).map(({ fp }) => fp)
      : allFiles.slice(0, 1);

    for (const filePath of candidates) {
      if (sourceFiles[filePath]) continue;
      if (Object.keys(sourceFiles).length >= MAX_TOTAL_FILES) break;
      try {
        const content = await fetchRepoFile(repoUrl, filePath, githubToken);
        if (content) sourceFiles[filePath] = content;
      } catch { }
    }
  }

  return sourceFiles;
}

/**
 * Enriches Critical and Serious findings using Claude AI.
 * Returns findings with improved fixDescription, fixCode, and fixCodeLang.
 * Passthrough if AI is disabled or no apiKey is provided.
 *
 * @param {EnrichedFinding[]} findings
 * @param {{
 *   stack?: { framework?: string, cms?: string, uiLibraries?: string[] },
 *   repoUrl?: string,
 * }} context
 * @param {{
 *   enabled?: boolean,
 *   apiKey?: string,
 *   githubToken?: string,
 *   model?: string,
 * }} options
 * @returns {Promise<EnrichedFinding[]>}
 */
export async function enrichWithAI(findings, context = {}, options = {}) {
  const enabled = options.enabled !== false && !!options.apiKey;
  if (!enabled) return findings;

  const model = options.model || DEFAULT_MODEL;
  const audience = options.audience || "dev";
  const customSystemPrompt = options.systemPrompt || null;

  // Only enrich Critical and Serious findings, cap total
  const targets = findings
    .filter((f) => f.severity === "Critical" || f.severity === "Serious")
    .slice(0, MAX_AI_FINDINGS);

  if (targets.length === 0) return findings;

  try {
    // Fetch source files if repo is available
    const sourceFiles = context.repoUrl
      ? await fetchSourceFilesForFindings(targets, context.repoUrl, options.githubToken)
      : {};

    const isPm = audience === "pm";
    const systemPrompt = customSystemPrompt || (isPm
      ? PM_AI_SYSTEM_PROMPT
      : buildSystemPrompt({
          stack: context.stack,
          hasSourceCode: Object.keys(sourceFiles).length > 0,
        }));
    const userMessage = isPm
      ? buildPmUserMessage(targets)
      : buildUserMessage(targets, sourceFiles);

    const responseText = await callClaude(options.apiKey, model, systemPrompt, userMessage);

    // Parse Claude's JSON response
    let improvements = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) improvements = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn("[a11y-engine] Could not parse Claude response as JSON, skipping AI enrichment");
      return findings;
    }

    // Build a map by target index for fast lookup
    const targetIds = new Set(targets.map((f) => f.id));
    const targetList = findings.filter((f) => targetIds.has(f.id));
    const improvementMap = new Map(improvements.map((imp) => [imp.index, imp]));

    // Apply improvements to findings
    return findings.map((finding) => {
      const targetIdx = targetList.findIndex((t) => t.id === finding.id);
      if (targetIdx === -1) return finding;
      const imp = improvementMap.get(targetIdx);
      if (!imp) return finding;

      if (isPm) {
        return {
          ...finding,
          pmSummary: imp.pmSummary || finding.pmSummary,
          pmImpact: imp.pmImpact || finding.pmImpact,
          pmEffort: imp.pmEffort || finding.pmEffort,
        };
      }

      return {
        ...finding,
        fixDescription: imp.fixDescription || finding.fixDescription,
        fixCode: imp.fixCode || finding.fixCode,
        fixCodeLang: imp.fixCodeLang || finding.fixCodeLang,
      };
    });
  } catch (err) {
    console.warn(`[a11y-engine] AI enrichment failed (non-fatal): ${err.message}`);
    return findings;
  }
}
