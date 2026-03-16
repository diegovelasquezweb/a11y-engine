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
function buildSystemPrompt(context) {
  const { framework, cms, uiLibraries } = context.stack || {};

  let stackInfo = "";
  if (framework) stackInfo += `Framework: ${framework}\n`;
  if (cms) stackInfo += `CMS: ${cms}\n`;
  if (uiLibraries?.length) stackInfo += `UI Libraries: ${uiLibraries.join(", ")}\n`;

  return `You are an expert web accessibility engineer specializing in WCAG 2.2 AA remediation.

Your task is to improve the fix guidance for accessibility findings from an automated scan.
${stackInfo ? `\nProject context:\n${stackInfo}` : ""}
For each finding you receive, provide:
1. A clear, specific fix description (1-2 sentences, actionable, no jargon)
2. Ready-to-use fix code in the correct language for the stack${context.hasSourceCode ? "\n3. The exact line/component to change if you can identify it from the source code" : ""}

Rules:
- Keep fix code minimal and focused — only the changed element, not the whole file
- Use the detected framework syntax (JSX for React/Next.js, template syntax for Vue, etc.)
- Do not change component logic, only accessibility attributes
- If the fix requires multiple changes, show the most important one
- Respond in JSON only — no markdown, no explanation outside the JSON structure`;
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
async function fetchSourceFilesForFindings(findings, repoUrl, githubToken) {
  const sourceFiles = {};
  if (!repoUrl) return sourceFiles;

  const { fetchRepoFile, listRepoFiles, parseRepoUrl } = await import("../core/github-api.mjs");
  if (!parseRepoUrl(repoUrl)) return sourceFiles;

  const patterns = new Set(
    findings
      .filter((f) => f.fileSearchPattern)
      .map((f) => f.fileSearchPattern)
  );

  for (const pattern of patterns) {
    try {
      // Extract extension from pattern (e.g. "src/components/*.tsx" -> ".tsx")
      const extMatch = pattern.match(/\*\.(\w+)$/);
      if (!extMatch) continue;
      const ext = `.${extMatch[1]}`;

      const files = await listRepoFiles(repoUrl, [ext], githubToken);
      // Pick up to 3 most relevant files per pattern
      const relevant = files.slice(0, 3);
      for (const filePath of relevant) {
        if (!sourceFiles[filePath]) {
          const content = await fetchRepoFile(repoUrl, filePath, githubToken);
          if (content) sourceFiles[filePath] = content;
        }
      }
    } catch {
      // non-fatal
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

    const systemPrompt = buildSystemPrompt({
      stack: context.stack,
      hasSourceCode: Object.keys(sourceFiles).length > 0,
    });
    const userMessage = buildUserMessage(targets, sourceFiles);

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
