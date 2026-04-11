import fs from "node:fs";
import path from "node:path";
import { ASSETS } from "../core/asset-loader.mjs";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_CANDIDATE_FILES = 12;
const SUPPORTED_EXTENSIONS = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".astro", ".liquid"]);

export const FIX_ERROR_CODES = {
  INVALID_INPUT: "invalid-input",
  FINDING_NOT_FOUND: "finding-not-found",
  RULE_MISSING: "rule-missing",
  FILE_NOT_RESOLVED: "file-not-resolved",
  PATCH_GENERATION_FAILED: "patch-generation-failed",
  PATCH_APPLY_FAILED: "patch-apply-failed",
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWithin(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function normalizeRoute(value) {
  if (typeof value !== "string") return "/";
  const route = value.trim();
  return route || "/";
}

function slugify(value) {
  return String(value || "fix")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mapStatus(applied, reason) {
  if (applied) return "patched";
  if (reason === FIX_ERROR_CODES.INVALID_INPUT || reason === FIX_ERROR_CODES.FILE_NOT_RESOLVED) return "error";
  return "not_applied";
}

function buildResult(data = {}) {
  const applied = Boolean(data.applied);
  const reason = data.reason || "";
  const changedFiles = Array.isArray(data.changedFiles) ? data.changedFiles : [];
  const verifyRule = data.verifyRule || "";
  const verifyRoute = data.verifyRoute || "/";
  const findingTitle = data.findingTitle || "";
  const branchSlug = data.branchSlug || "a11y-fix";
  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };

  return {
    applied,
    reason,
    message: data.message || "",
    changedFiles,
    patch: data.patch || "",
    verifyRule,
    verifyRoute,
    findingTitle,
    branchSlug,
    usage,

    status: mapStatus(applied, reason),
    patchedFile: changedFiles[0] || "",
  };
}

function getFindingsPayload(input) {
  if (!isObject(input)) return null;
  if (isObject(input.findingsPayload)) return input.findingsPayload;
  if (isObject(input.payload)) return input.payload;
  return null;
}

function getFindings(input) {
  const payload = getFindingsPayload(input);
  if (!isObject(payload) || !Array.isArray(payload.findings)) return null;
  return payload.findings;
}

function getIntelligenceForRule(ruleId) {
  const rules = ASSETS.remediation.intelligence?.rules || {};
  return isObject(rules[ruleId]) ? rules[ruleId] : {};
}

function listFilesRecursive(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(abs);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) out.push(abs);
    }
  }
  return out;
}

function selectorTokens(selector) {
  return String(selector || "")
    .replace(/[:#\.\[\]>+~(),=*"']/g, " ")
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t.length > 1 && !/^nth-/.test(t))
    .slice(0, 8);
}

function scoreFile(filePath, content, tokens) {
  if (tokens.length === 0) return 1;
  const lcPath = filePath.toLowerCase();
  const lcContent = content.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lcPath.includes(token)) score += 2;
    if (lcContent.includes(token)) score += 3;
  }
  return score;
}

function getPatternFindings(input) {
  if (!isObject(input)) return null;
  const payload = input.patternPayload ?? input.patternFindingsPayload ?? null;
  if (!isObject(payload) || !Array.isArray(payload.findings)) return null;
  return payload.findings;
}

function getPatternCandidateFile(projectDir, finding) {
  if (!finding.file || typeof finding.file !== "string") return null;
  const abs = path.resolve(projectDir, finding.file);
  if (!isWithin(projectDir, abs)) return null;
  if (!fs.existsSync(abs)) return null;
  const content = fs.readFileSync(abs, "utf8");
  return { abs, rel: finding.file, content };
}

function buildPatternAiInput({ finding, candidate }) {
  return {
    finding: {
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      patternId: finding.pattern_id || finding.patternId || "",
      file: finding.file,
      line: finding.line ?? null,
      match: finding.match || "",
      context: finding.context || "",
      fixDescription: finding.fix_description || "",
    },
    files: [{ filePath: candidate.rel, content: candidate.content.slice(0, 12000) }],
  };
}

function getCandidateFiles(projectDir, finding) {
  const files = listFilesRecursive(projectDir);
  const tokens = selectorTokens(finding.selector);
  const ranked = files
    .map((abs) => {
      const content = fs.readFileSync(abs, "utf8");
      const rel = path.relative(projectDir, abs);
      return { abs, rel, content, score: scoreFile(rel, content, tokens) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATE_FILES);
  return ranked;
}

function buildExecution(ruleId, intelligenceRule, finding) {
  const ruleVerify = finding.rule_id || ruleId || "";
  const route = normalizeRoute(finding.area);
  return {
    strategy: "ai-dom-patch",
    operations: ["text-replace"],
    constraints: {
      must: intelligenceRule.guardrails_overrides?.must || intelligenceRule.guardrails?.must || [],
      must_not:
        intelligenceRule.guardrails_overrides?.must_not || intelligenceRule.guardrails?.must_not || [],
      verify: intelligenceRule.guardrails_overrides?.verify || intelligenceRule.guardrails?.verify || [],
    },
    verify: {
      ruleId: ruleVerify,
      route,
    },
  };
}

function groupFindingsByFile(domFindings, projectDir) {
  const allFiles = listFilesRecursive(projectDir).map((abs) => {
    const rel = path.relative(projectDir, abs);
    const content = fs.readFileSync(abs, "utf8");
    return { abs, rel, content };
  });

  const groups = new Map();

  for (const finding of domFindings) {
    const tokens = selectorTokens(finding.selector);
    const ranked = allFiles
      .map((f) => ({ ...f, score: scoreFile(f.rel, f.content, tokens) }))
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATE_FILES);

    const key = ranked.length > 0 ? ranked[0].rel : `__no_candidates_${finding.id}`;
    if (!groups.has(key)) {
      groups.set(key, { candidates: ranked, findings: [] });
    }
    groups.get(key).findings.push(finding);
  }

  return groups;
}

function buildAiFixInputMulti({ findings, intelligenceRules, candidates, projectHints }) {
  return {
    findings: findings.map((finding) => {
      const ruleId = typeof finding.rule_id === "string" ? finding.rule_id.trim() : "";
      const rule = intelligenceRules[ruleId] || {};
      const execution = buildExecution(ruleId, rule, finding);
      return {
        id: finding.id,
        ruleId,
        title: finding.title,
        severity: finding.severity,
        selector: finding.selector,
        actual: finding.actual,
        expected: finding.expected,
        area: finding.area,
        url: finding.url,
        fixDescription: finding.fix_description || rule.fix?.description || "",
        fixCode: finding.fix_code || rule.fix?.code || "",
        constraints: execution.constraints,
      };
    }),
    projectContext: projectHints || "",
    files: candidates.map((c) => ({ filePath: c.rel, content: c.content.slice(0, 12000) })),
  };
}

function buildAiFixInput({ finding, intelligenceRule, execution, candidates, projectHints }) {
  return {
    finding: {
      id: finding.id,
      ruleId: finding.rule_id,
      title: finding.title,
      severity: finding.severity,
      selector: finding.selector,
      actual: finding.actual,
      expected: finding.expected,
      area: finding.area,
      url: finding.url,
      fixDescription: finding.fix_description || intelligenceRule.fix?.description || "",
      fixCode: finding.fix_code || intelligenceRule.fix?.code || "",
    },
    intelligence: {
      category: intelligenceRule.category || "",
      frameworkNotes: intelligenceRule.framework_notes || {},
      cmsNotes: intelligenceRule.cms_notes || {},
      fixDifficultyNotes: intelligenceRule.fix_difficulty_notes || "",
    },
    execution,
    projectContext: projectHints || "",
    files: candidates.map((c) => ({ filePath: c.rel, content: c.content.slice(0, 12000) })),
  };
}

function parseJsonBlock(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const codeFence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = codeFence ? codeFence[1] : raw;
  try {
    return JSON.parse(source);
  } catch {
    const objMatch = source.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      return null;
    }
  }
}

async function callClaudeForPatch({ apiKey, model, aiInput }) {
  const system = [
    "You are an accessibility fix engine.",
    "Return JSON only.",
    "Generate deterministic text replacements for provided files.",
    "Use finding.fixDescription and execution.constraints.must as guidance for what to fix and how.",
    "For insertions (new element that does not yet exist in the file), use the nearest existing parent element as the search anchor. The replace value must include that anchor plus the new content.",
    "Do not create files. Do not modify paths outside provided filePath values.",
    "Schema:",
    "{\"changes\":[{\"filePath\":\"...\",\"search\":\"...\",\"replace\":\"...\"}],\"verifyRule\":\"...\",\"verifyRoute\":\"...\",\"notes\":\"...\"}",
  ].join("\n");

  const userMessage = JSON.stringify(aiInput, null, 2);

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
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Claude patch generation failed: ${res.status} ${message}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text || "";
  const parsed = parseJsonBlock(content);
  if (!isObject(parsed)) throw new Error("AI patch output is not valid JSON object");
  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
  return { patch: parsed, usage };
}

function validateAiPatchOutput(output, projectDir, fileSet) {
  if (!isObject(output)) return { ok: false, reason: "AI patch output is empty" };
  if (!Array.isArray(output.changes) || output.changes.length === 0) {
    return { ok: false, reason: "AI patch output has no changes" };
  }

  for (const change of output.changes) {
    if (!isObject(change)) return { ok: false, reason: "Invalid change item" };
    const filePath = typeof change.filePath === "string" ? change.filePath.trim() : "";
    const search = typeof change.search === "string" ? change.search : "";
    const replace = typeof change.replace === "string" ? change.replace : "";
    if (!filePath || !search) return { ok: false, reason: "Change is missing filePath/search" };
    if (!fileSet.has(filePath)) return { ok: false, reason: `Change file not in candidate set: ${filePath}` };
    if (search === replace) return { ok: false, reason: `AI generated a no-op patch for ${filePath} — search and replace are identical` };

    const abs = path.resolve(projectDir, filePath);
    if (!isWithin(projectDir, abs) && abs !== path.resolve(projectDir, filePath)) {
      return { ok: false, reason: `Change path escapes projectDir: ${filePath}` };
    }
    if (replace.length > 20000) return { ok: false, reason: `Replacement too large for ${filePath}` };
  }

  return { ok: true };
}

function applyChanges(projectDir, changes) {
  const changedFiles = [];
  const patchParts = [];

  for (const change of changes) {
    const rel = change.filePath;
    const abs = path.resolve(projectDir, rel);
    const original = fs.readFileSync(abs, "utf8");
    if (!original.includes(change.search)) {
      return { ok: false, reason: `Search block not found in ${rel}` };
    }
    const updated = original.replace(change.search, change.replace);
    if (updated === original) continue;
    fs.writeFileSync(abs, updated, "utf8");
    changedFiles.push(rel);
    patchParts.push(`--- ${rel}\n+++ ${rel}\n@@\n-${change.search}\n+${change.replace}`);
  }

  if (changedFiles.length === 0) return { ok: false, reason: "No effective changes were applied" };

  return {
    ok: true,
    changedFiles: [...new Set(changedFiles)],
    patch: patchParts.join("\n"),
  };
}

/**
 * @param {{
 *  findingId: string,
 *  findingsPayload?: { findings: Array<Record<string, unknown>> },
 *  payload?: { findings: Array<Record<string, unknown>> },
 *  projectDir: string,
 *  ai?: { apiKey?: string, model?: string },
 * }} input
 */
export async function applyFindingFix(input) {
  if (!isObject(input)) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.INVALID_INPUT,
      message: "Input must be an object.",
    });
  }

  const findingId = typeof input.findingId === "string" ? input.findingId.trim() : "";
  const projectDir = typeof input.projectDir === "string" ? input.projectDir.trim() : "";
  const projectHints = typeof input.projectHints === "string" ? input.projectHints.trim() : "";

  if (!findingId || !projectDir) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.INVALID_INPUT,
      message: "Required input is missing: findingId, findingsPayload.findings, or projectDir.",
    });
  }

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.FILE_NOT_RESOLVED,
      message: `Project directory does not exist: ${projectDir}`,
    });
  }

  const isPattern = findingId.startsWith("PAT-");
  const apiKey = input.ai?.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const model = input.ai?.model || DEFAULT_MODEL;

  if (isPattern) {
    const patternFindings = getPatternFindings(input);
    if (!patternFindings) {
      return buildResult({
        applied: false,
        reason: FIX_ERROR_CODES.INVALID_INPUT,
        message: "Required input is missing: patternPayload.findings is absent or invalid.",
      });
    }

    const finding = patternFindings.find((entry) => isObject(entry) && entry.id === findingId);
    if (!finding) {
      return buildResult({
        applied: false,
        reason: FIX_ERROR_CODES.FINDING_NOT_FOUND,
        message: `Finding ${findingId} was not found in patternPayload.findings.`,
        findingTitle: "",
      });
    }

    const candidate = getPatternCandidateFile(projectDir, finding);
    if (!candidate) {
      return buildResult({
        applied: false,
        reason: FIX_ERROR_CODES.FILE_NOT_RESOLVED,
        message: `Could not resolve file for finding ${findingId}: ${finding.file || "(no file)"}`,
        findingTitle: finding.title || "",
        branchSlug: slugify(`${findingId}-${finding.pattern_id || finding.patternId || ""}`),
      });
    }

    const aiInput = buildPatternAiInput({ finding, candidate });
    const candidateSet = new Set([candidate.rel]);

    let patchOutput = null;
    let claudeUsage = { input_tokens: 0, output_tokens: 0 };
    if (apiKey) {
      try {
        const { patch, usage } = await callClaudeForPatch({ apiKey, model, aiInput });
        patchOutput = patch;
        claudeUsage = usage;
      } catch {
        patchOutput = null;
      }
    }

    if (!patchOutput) {
      return buildResult({
        applied: false,
        reason: FIX_ERROR_CODES.PATCH_GENERATION_FAILED,
        message: `Could not generate patch output for finding ${findingId}.`,
        verifyRule: "",
        verifyRoute: "/",
        findingTitle: finding.title || "",
        branchSlug: slugify(`${findingId}-${finding.pattern_id || finding.patternId || ""}`),
        usage: claudeUsage,
      });
    }

    const validation = validateAiPatchOutput(patchOutput, projectDir, candidateSet);
    if (!validation.ok) {
      return buildResult({
        applied: false,
        reason: FIX_ERROR_CODES.PATCH_GENERATION_FAILED,
        message: validation.reason,
        verifyRule: "",
        verifyRoute: "/",
        findingTitle: finding.title || "",
        branchSlug: slugify(`${findingId}-${finding.pattern_id || finding.patternId || ""}`),
        usage: claudeUsage,
      });
    }

    const applied = applyChanges(projectDir, patchOutput.changes);
    if (!applied.ok) {
      return buildResult({
        applied: false,
        reason: FIX_ERROR_CODES.PATCH_APPLY_FAILED,
        message: applied.reason,
        verifyRule: "",
        verifyRoute: "/",
        findingTitle: finding.title || "",
        branchSlug: slugify(`${findingId}-${finding.pattern_id || finding.patternId || ""}`),
        usage: claudeUsage,
      });
    }

    return buildResult({
      applied: true,
      reason: "",
      message: "Patch applied successfully.",
      changedFiles: applied.changedFiles,
      patch: applied.patch,
      verifyRule: "",
      verifyRoute: "/",
      findingTitle: finding.title || "",
      branchSlug: slugify(`${findingId}-${finding.pattern_id || finding.patternId || ""}`),
      usage: claudeUsage,
    });
  }

  const findings = getFindings(input);
  if (!findings) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.INVALID_INPUT,
      message: "Required input is missing: findingId, findingsPayload.findings, or projectDir.",
    });
  }

  const finding = findings.find((entry) => isObject(entry) && entry.id === findingId);
  if (!finding) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.FINDING_NOT_FOUND,
      message: `Finding ${findingId} was not found in findingsPayload.findings.`,
    });
  }

  const ruleId = typeof finding.rule_id === "string" ? finding.rule_id.trim() : "";
  const verifyRoute = normalizeRoute(finding.area);
  if (!ruleId) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.RULE_MISSING,
      message: `Finding ${findingId} does not include a rule_id.`,
      verifyRoute,
    });
  }

  const intelligenceRule = getIntelligenceForRule(ruleId);
  const execution = buildExecution(ruleId, intelligenceRule, finding);
  const candidates = getCandidateFiles(projectDir, finding);
  if (candidates.length === 0) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.FILE_NOT_RESOLVED,
      message: "No candidate source files were found for this finding.",
      verifyRule: execution.verify.ruleId,
      verifyRoute: execution.verify.route,
      findingTitle: finding.title || "",
      branchSlug: slugify(`${findingId}-${ruleId}`),
    });
  }

  const aiInput = buildAiFixInput({ finding, intelligenceRule, execution, candidates, projectHints });
  const candidateSet = new Set(candidates.map((c) => c.rel));

  let patchOutput = null;
  let claudeUsage = { input_tokens: 0, output_tokens: 0 };
  if (apiKey) {
    try {
      const { patch, usage } = await callClaudeForPatch({ apiKey, model, aiInput });
      patchOutput = patch;
      claudeUsage = usage;
    } catch {
      patchOutput = null;
    }
  }

  if (!patchOutput) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.PATCH_GENERATION_FAILED,
      message: `Could not generate patch output for rule ${ruleId}.`,
      verifyRule: execution.verify.ruleId,
      verifyRoute: execution.verify.route,
      findingTitle: finding.title || "",
      branchSlug: slugify(`${findingId}-${ruleId}`),
      usage: claudeUsage,
    });
  }

  const validation = validateAiPatchOutput(patchOutput, projectDir, candidateSet);
  if (!validation.ok) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.PATCH_GENERATION_FAILED,
      message: validation.reason,
      verifyRule: execution.verify.ruleId,
      verifyRoute: execution.verify.route,
      findingTitle: finding.title || "",
      branchSlug: slugify(`${findingId}-${ruleId}`),
      usage: claudeUsage,
    });
  }

  const applied = applyChanges(projectDir, patchOutput.changes);
  if (!applied.ok) {
    return buildResult({
      applied: false,
      reason: FIX_ERROR_CODES.PATCH_APPLY_FAILED,
      message: applied.reason,
      verifyRule: execution.verify.ruleId,
      verifyRoute: execution.verify.route,
      findingTitle: finding.title || "",
      branchSlug: slugify(`${findingId}-${ruleId}`),
      usage: claudeUsage,
    });
  }

  return buildResult({
    applied: true,
    reason: "",
    message: "Patch applied successfully.",
    changedFiles: applied.changedFiles,
    patch: applied.patch,
    verifyRule: patchOutput.verifyRule || execution.verify.ruleId,
    verifyRoute: patchOutput.verifyRoute || execution.verify.route,
    findingTitle: finding.title || "",
    branchSlug: slugify(`${findingId}-${ruleId}`),
    usage: claudeUsage,
  });
}

/**
 * Apply fixes for multiple DOM finding IDs grouped by candidate file.
 * PAT-* findings are not handled here — pass them to applyFindingFix individually.
 *
 * @param {{
 *   findingIds: string[],
 *   findingsPayload?: { findings: Array<Record<string, unknown>> },
 *   payload?: { findings: Array<Record<string, unknown>> },
 *   projectDir: string,
 *   projectHints?: string,
 *   ai?: { apiKey?: string, model?: string },
 * }} input
 * @returns {Promise<{ results: Array<{ id: string } & ReturnType<typeof buildResult>> }>}
 */
export async function applyFindingsFix(input) {
  if (!isObject(input)) {
    return { results: [] };
  }

  const findingIds = Array.isArray(input.findingIds)
    ? input.findingIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const projectDir = typeof input.projectDir === "string" ? input.projectDir.trim() : "";
  const projectHints = typeof input.projectHints === "string" ? input.projectHints.trim() : "";
  const apiKey = input.ai?.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const model = input.ai?.model || DEFAULT_MODEL;

  function makeResult(id, data) {
    return { id, ...buildResult(data) };
  }

  if (findingIds.length === 0 || !projectDir) {
    return { results: [] };
  }

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return {
      results: findingIds.map((id) =>
        makeResult(id, {
          applied: false,
          reason: FIX_ERROR_CODES.FILE_NOT_RESOLVED,
          message: `Project directory does not exist: ${projectDir}`,
        }),
      ),
    };
  }

  const findings = getFindings(input);
  if (!findings) {
    return {
      results: findingIds.map((id) =>
        makeResult(id, {
          applied: false,
          reason: FIX_ERROR_CODES.INVALID_INPUT,
          message: "Required input is missing: findingsPayload.findings.",
        }),
      ),
    };
  }

  const resultMap = new Map();

  // Resolve finding objects; mark missing ones immediately
  const resolved = findingIds.map((id) => {
    const finding = findings.find((f) => isObject(f) && f.id === id);
    if (!finding) {
      resultMap.set(
        id,
        makeResult(id, {
          applied: false,
          reason: FIX_ERROR_CODES.FINDING_NOT_FOUND,
          message: `Finding ${id} was not found in findingsPayload.findings.`,
        }),
      );
    }
    return { id, finding: finding || null };
  });

  const domFindings = resolved.filter((r) => r.finding).map((r) => r.finding);
  if (domFindings.length === 0) {
    return { results: findingIds.map((id) => resultMap.get(id)) };
  }

  const groups = groupFindingsByFile(domFindings, projectDir);

  for (const [topFile, { candidates, findings: groupFindings }] of groups) {
    if (candidates.length === 0) {
      for (const finding of groupFindings) {
        resultMap.set(
          finding.id,
          makeResult(finding.id, {
            applied: false,
            reason: FIX_ERROR_CODES.FILE_NOT_RESOLVED,
            message: "No candidate source files were found for this finding.",
            findingTitle: finding.title || "",
            branchSlug: slugify(`${finding.id}-${finding.rule_id || ""}`),
          }),
        );
      }
      continue;
    }

    // Collect intelligence rules and filter out findings missing rule_id
    const intelligenceRules = {};
    const withRules = [];
    for (const finding of groupFindings) {
      const ruleId = typeof finding.rule_id === "string" ? finding.rule_id.trim() : "";
      if (!ruleId) {
        resultMap.set(
          finding.id,
          makeResult(finding.id, {
            applied: false,
            reason: FIX_ERROR_CODES.RULE_MISSING,
            message: `Finding ${finding.id} does not include a rule_id.`,
            findingTitle: finding.title || "",
          }),
        );
        continue;
      }
      intelligenceRules[ruleId] = getIntelligenceForRule(ruleId);
      withRules.push(finding);
    }

    if (withRules.length === 0) continue;

    const candidateSet = new Set(candidates.map((c) => c.rel));
    const aiInput = buildAiFixInputMulti({ findings: withRules, intelligenceRules, candidates, projectHints });

    let patchOutput = null;
    let claudeUsage = { input_tokens: 0, output_tokens: 0 };
    if (apiKey) {
      try {
        const { patch, usage } = await callClaudeForPatch({ apiKey, model, aiInput });
        patchOutput = patch;
        claudeUsage = usage;
      } catch {
        patchOutput = null;
      }
    }

    if (!patchOutput) {
      for (const finding of withRules) {
        resultMap.set(
          finding.id,
          makeResult(finding.id, {
            applied: false,
            reason: FIX_ERROR_CODES.PATCH_GENERATION_FAILED,
            message: `Could not generate patch output for file group (top file: ${topFile}).`,
            findingTitle: finding.title || "",
            branchSlug: slugify(`${finding.id}-${finding.rule_id || ""}`),
            usage: claudeUsage,
          }),
        );
      }
      continue;
    }

    const validation = validateAiPatchOutput(patchOutput, projectDir, candidateSet);
    if (!validation.ok) {
      for (const finding of withRules) {
        resultMap.set(
          finding.id,
          makeResult(finding.id, {
            applied: false,
            reason: FIX_ERROR_CODES.PATCH_GENERATION_FAILED,
            message: validation.reason,
            findingTitle: finding.title || "",
            branchSlug: slugify(`${finding.id}-${finding.rule_id || ""}`),
            usage: claudeUsage,
          }),
        );
      }
      continue;
    }

    const applied = applyChanges(projectDir, patchOutput.changes);
    if (!applied.ok) {
      for (const finding of withRules) {
        resultMap.set(
          finding.id,
          makeResult(finding.id, {
            applied: false,
            reason: FIX_ERROR_CODES.PATCH_APPLY_FAILED,
            message: applied.reason,
            findingTitle: finding.title || "",
            branchSlug: slugify(`${finding.id}-${finding.rule_id || ""}`),
            usage: claudeUsage,
          }),
        );
      }
      continue;
    }

    // Split token usage evenly across findings in the group
    const n = withRules.length;
    const perInput = Math.round(claudeUsage.input_tokens / n);
    const perOutput = Math.round(claudeUsage.output_tokens / n);

    for (const finding of withRules) {
      const ruleId = typeof finding.rule_id === "string" ? finding.rule_id.trim() : "";
      const intelligenceRule = intelligenceRules[ruleId] || {};
      const execution = buildExecution(ruleId, intelligenceRule, finding);
      resultMap.set(
        finding.id,
        makeResult(finding.id, {
          applied: true,
          reason: "",
          message: "Patch applied successfully.",
          changedFiles: applied.changedFiles,
          patch: applied.patch,
          verifyRule: patchOutput.verifyRule || execution.verify.ruleId,
          verifyRoute: patchOutput.verifyRoute || execution.verify.route,
          findingTitle: finding.title || "",
          branchSlug: slugify(`${finding.id}-${ruleId}`),
          usage: { input_tokens: perInput, output_tokens: perOutput },
        }),
      );
    }
  }

  return {
    results: findingIds.map(
      (id) =>
        resultMap.get(id) ||
        makeResult(id, {
          applied: false,
          reason: FIX_ERROR_CODES.FINDING_NOT_FOUND,
          message: `Finding ${id} was not found.`,
        }),
    ),
  };
}
