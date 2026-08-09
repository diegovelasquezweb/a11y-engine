import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyFindingFix, applyFindingsFix, FIX_ERROR_CODES } from "../src/index.mjs";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "a11y-engine-test-"));
}

function writeFile(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function makeFinding(overrides = {}) {
  return {
    id: "A11Y-1",
    rule_id: "image-alt",
    title: "Image missing alt text",
    severity: "Critical",
    selector: "img",
    area: "/",
    url: "http://localhost/",
    actual: "",
    expected: "",
    fix_description: "Add an alt attribute to the img element.",
    ...overrides,
  };
}

function makePayload(findings) {
  return { findings };
}

// ── guard: invalid / empty inputs ────────────────────────────────────────────

describe("applyFindingsFix — input validation", () => {
  it("returns empty results for non-object input", async () => {
    const result = await applyFindingsFix(null);
    expect(result).toEqual({ results: [] });
  });

  it("returns empty results when findingIds is empty", async () => {
    const result = await applyFindingsFix({ findingIds: [], projectDir: "/tmp", findingsPayload: makePayload([]) });
    expect(result).toEqual({ results: [] });
  });

  it("returns empty results when projectDir is missing", async () => {
    const result = await applyFindingsFix({ findingIds: ["A11Y-1"], projectDir: "" });
    expect(result).toEqual({ results: [] });
  });

  it("returns file-not-resolved for each ID when projectDir does not exist", async () => {
    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1", "A11Y-2"],
      projectDir: "/tmp/__nonexistent_dir_xyz__",
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" }), makeFinding({ id: "A11Y-2" })]),
    });

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe("error");
      expect(r.reason).toBe(FIX_ERROR_CODES.FILE_NOT_RESOLVED);
    }
  });

  it("returns invalid-input for each ID when findingsPayload is missing", async () => {
    const dir = makeTmpDir();
    try {
      const { results } = await applyFindingsFix({
        findingIds: ["A11Y-1"],
        projectDir: dir,
      });
      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe(FIX_ERROR_CODES.INVALID_INPUT);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── finding resolution ────────────────────────────────────────────────────────

describe("applyFindingsFix — finding resolution", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
    writeFile(dir, "index.html", '<html><body><img src="hero.png" /></body></html>');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns finding-not-found when ID is absent from payload", async () => {
    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-999"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("A11Y-999");
    expect(results[0].reason).toBe(FIX_ERROR_CODES.FINDING_NOT_FOUND);
  });

  it("returns rule-missing when finding has no rule_id", async () => {
    const finding = makeFinding({ id: "A11Y-1", rule_id: "" });
    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([finding]),
    });

    expect(results[0].reason).toBe(FIX_ERROR_CODES.RULE_MISSING);
  });

  it("returns file-not-resolved when project directory has no supported source files", async () => {
    // Empty directory — no HTML/JSX/etc files → no candidates possible
    const emptyDir = makeTmpDir();
    try {
      const { results } = await applyFindingsFix({
        findingIds: ["A11Y-1"],
        projectDir: emptyDir,
        findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      });
      expect(results[0].reason).toBe(FIX_ERROR_CODES.FILE_NOT_RESOLVED);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ── grouping behaviour ────────────────────────────────────────────────────────

describe("applyFindingsFix — group-by-file", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
    // Two findings both target tokens found in index.html
    writeFile(
      dir,
      "index.html",
      '<html><body><img src="hero.png" /><button></button></body></html>',
    );
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("both findings in the same file group get patch-generation-failed (no API key)", async () => {
    const f1 = makeFinding({ id: "A11Y-1", selector: "img", rule_id: "image-alt" });
    const f2 = makeFinding({ id: "A11Y-2", selector: "button", rule_id: "button-name", title: "Button has no accessible name" });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1", "A11Y-2"],
      projectDir: dir,
      findingsPayload: makePayload([f1, f2]),
      ai: { apiKey: "" },
    });

    expect(results).toHaveLength(2);

    const r1 = results.find((r) => r.id === "A11Y-1");
    const r2 = results.find((r) => r.id === "A11Y-2");

    // Both fail because no API key → patch generation failed
    expect(r1.reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);
    expect(r2.reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);

    // Both share the same group message (same top file)
    expect(r1.message).toBe(r2.message);
    expect(r1.message).toContain("index.html");
  });

  it("result order matches the input findingIds order", async () => {
    const f1 = makeFinding({ id: "A11Y-10", selector: "img" });
    const f2 = makeFinding({ id: "A11Y-3", selector: "img" });
    const f3 = makeFinding({ id: "A11Y-7", selector: "button", rule_id: "button-name" });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-10", "A11Y-3", "A11Y-7"],
      projectDir: dir,
      findingsPayload: makePayload([f1, f2, f3]),
      ai: { apiKey: "" },
    });

    expect(results.map((r) => r.id)).toEqual(["A11Y-10", "A11Y-3", "A11Y-7"]);
  });

  it("mixed resolved/unresolved IDs: found ones fail with patch error, missing ones get finding-not-found", async () => {
    const f1 = makeFinding({ id: "A11Y-1", selector: "img" });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1", "A11Y-GHOST"],
      projectDir: dir,
      findingsPayload: makePayload([f1]),
      ai: { apiKey: "" },
    });

    const found = results.find((r) => r.id === "A11Y-1");
    const ghost = results.find((r) => r.id === "A11Y-GHOST");

    expect(found.reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);
    expect(ghost.reason).toBe(FIX_ERROR_CODES.FINDING_NOT_FOUND);
  });

  it("findings across different files are placed in separate groups", async () => {
    // page.html only matches "page" token; index.html only matches "img"
    writeFile(dir, "page.html", "<html><body><input /></body></html>");

    const f1 = makeFinding({ id: "A11Y-1", selector: "img", rule_id: "image-alt" });
    const f2 = makeFinding({ id: "A11Y-2", selector: "input", rule_id: "label", title: "Input missing label" });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1", "A11Y-2"],
      projectDir: dir,
      findingsPayload: makePayload([f1, f2]),
      ai: { apiKey: "" },
    });

    const r1 = results.find((r) => r.id === "A11Y-1");
    const r2 = results.find((r) => r.id === "A11Y-2");

    // Both fail (no API key) but from different groups → different messages
    expect(r1.message).not.toBe(r2.message);
  });
});

// ── result shape ──────────────────────────────────────────────────────────────

describe("applyFindingsFix — result shape", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
    writeFile(dir, "index.html", "<html><body><img src='hero.png'/></body></html>");
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("each result includes id, status, reason, message, patchedFile, usage", async () => {
    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "" },
    });

    const r = results[0];
    expect(r).toHaveProperty("id", "A11Y-1");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("message");
    expect(r).toHaveProperty("patchedFile");
    expect(r).toHaveProperty("usage");
    expect(r.usage).toHaveProperty("input_tokens");
    expect(r.usage).toHaveProperty("output_tokens");
  });
});

// ── Claude patch-generation contract (structured output) ────────────────────

describe("applyFindingsFix — Claude patch-generation contract", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
    writeFile(dir, "index.html", "<html><body><img src='hero.png'/></body></html>");
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  function stubFetch(responseBody) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("retries findings Claude silently omitted from a batch response, resolving them individually", async () => {
    writeFile(dir, "index.html", "<html><body><img src='hero.png'/><button></button></body></html>");

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stop_reason: "end_turn",
        // Only A11Y-1 tagged — A11Y-2 silently omitted from this batch response.
        content: [{ type: "text", text: JSON.stringify({ changes: [{ filePath: "index.html", search: "<img src='hero.png'/>", replace: "<img src='hero.png' alt=''/>", findingId: "A11Y-1" }] }) }],
        usage: { input_tokens: 20, output_tokens: 10 },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ changes: [{ filePath: "index.html", search: "<button></button>", replace: "<button aria-label='Menu'></button>", findingId: "A11Y-2" }] }) }],
        usage: { input_tokens: 8, output_tokens: 4 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1", "A11Y-2"],
      projectDir: dir,
      findingsPayload: makePayload([
        makeFinding({ id: "A11Y-1", selector: "img" }),
        makeFinding({ id: "A11Y-2", selector: "button", rule_id: "button-name", title: "Button has no accessible name" }),
      ]),
      ai: { apiKey: "test-key" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.find((r) => r.id === "A11Y-1").status).toBe("patched");
    expect(results.find((r) => r.id === "A11Y-2").status).toBe("patched");
    const finalContent = fs.readFileSync(`${dir}/index.html`, "utf8");
    expect(finalContent).toContain("alt=''");
    expect(finalContent).toContain("aria-label='Menu'");
  });

  it("sends a json_schema output_config so every model returns a validated shape", async () => {
    const fetchMock = stubFetch({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ changes: [{ filePath: "index.html", search: "<img src='hero.png'/>", replace: "<img src='hero.png' alt=''/>" }] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key", model: "claude-sonnet-5" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.required).toEqual(["changes"]);
  });

  it("finds the JSON in the text block even when a thinking block is emitted first (Sonnet 5 adaptive thinking)", async () => {
    stubFetch({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "Let me consider the best fix for this finding..." },
        { type: "text", text: JSON.stringify({ changes: [{ filePath: "index.html", search: "<img src='hero.png'/>", replace: "<img src='hero.png' alt=''/>" }] }) },
      ],
      usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: { thinking_tokens: 4 } },
    });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key", model: "claude-sonnet-5" },
    });

    expect(results[0].status).toBe("patched");
  });

  it("applies the patch when the structured JSON response parses cleanly", async () => {
    stubFetch({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ changes: [{ filePath: "index.html", search: "<img src='hero.png'/>", replace: "<img src='hero.png' alt=''/>" }] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });

    expect(results[0].status).toBe("patched");
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toContain("alt=''");
  });

  it("classifies a truncated (max_tokens) response distinctly from a generic failure", async () => {
    stubFetch({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"changes":[{"filePath":"index.html","search":"<img' }],
      usage: { input_tokens: 10, output_tokens: 4096 },
    });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });

    expect(results[0].reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);
    expect(results[0].message).toContain("truncated");
    expect(results[0].message).toContain("max_tokens");
  });

  it("classifies a non-JSON response body distinctly, including a safe truncated snippet", async () => {
    stubFetch({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I'm sorry, I cannot format this as JSON right now." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });

    expect(results[0].reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);
    expect(results[0].message).toContain("not valid JSON");
    expect(results[0].message).toContain("cannot format this as JSON");
  });

  it("classifies an HTTP API error with status and error type, never a raw crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { type: "invalid_request_error", message: "model does not support structured outputs" } }),
      }),
    );

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });

    expect(results[0].reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);
    expect(results[0].message).toContain("400");
    expect(results[0].message).toContain("invalid_request_error");
  });

  it("retries a transient 529 overload and succeeds once the API recovers", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 529,
      text: async () => JSON.stringify({ error: { type: "overloaded_error", message: "Overloaded" } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ changes: [{ filePath: "index.html", search: "<img src='hero.png'/>", replace: "<img src='hero.png' alt=''/>" }] }) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    const promise = applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });
    await vi.runAllTimersAsync();
    const { results } = await promise;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe("patched");
  });

  it("gives up after exhausting retries on a persistent 529 overload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 529,
      text: async () => JSON.stringify({ error: { type: "overloaded_error", message: "Overloaded" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    const promise = applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });
    await vi.runAllTimersAsync();
    const { results } = await promise;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results[0].reason).toBe(FIX_ERROR_CODES.PATCH_GENERATION_FAILED);
    expect(results[0].message).toContain("529");
  });

  it("does not retry a non-retryable 400 error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { type: "invalid_request_error", message: "bad request" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── PAT no-op recovery: absence-based "already resolved" detection ──────────

describe("applyFindingFix — already-resolved detection for remove-only patterns", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("recognizes a no-op as already resolved when the pattern's own detection regex no longer matches (no context_reject_regex needed)", async () => {
    // Simulates PAT-2a9053: a sibling finding already stripped this button's
    // accesskey, so nothing is left to change — Claude echoes the same text
    // back as both search and replace (a no-op). "character-key-shortcut" has
    // context_reject_regex: null, so only the pattern's own regex (accesskey=)
    // failing to match the current context can prove this is genuinely fixed.
    writeFile(dir, "index.html", '<button>Submit form</button>\n');

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              changes: [{ filePath: "index.html", search: "<button>Submit form</button>", replace: "<button>Submit form</button>" }],
            }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const finding = {
      id: "PAT-2a9053",
      pattern_id: "character-key-shortcut",
      title: "Single-character accesskey shortcut with no override mechanism",
      severity: "Moderate",
      file: "index.html",
      line: 1,
      match: 'accesskey="s"',
      context: '<button accesskey="s">Submit form</button>',
      fix_description: "Remove the accesskey attribute.",
    };

    const result = await applyFindingFix({
      findingId: "PAT-2a9053",
      patternPayload: { findings: [finding] },
      projectDir: dir,
      ai: { apiKey: "test-key" },
    });

    expect(result.applied).toBe(true);
    expect(result.message).toBe("Already resolved by a prior fix.");
  });

  it("still reports failure for a genuine no-op when the anti-pattern is still present", async () => {
    writeFile(dir, "index.html", '<button accesskey="s">Submit form</button>\n');

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              changes: [{ filePath: "index.html", search: '<button accesskey="s">Submit form</button>', replace: '<button accesskey="s">Submit form</button>' }],
            }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const finding = {
      id: "PAT-2a9053",
      pattern_id: "character-key-shortcut",
      title: "Single-character accesskey shortcut with no override mechanism",
      severity: "Moderate",
      file: "index.html",
      line: 1,
      match: 'accesskey="s"',
      context: '<button accesskey="s">Submit form</button>',
      fix_description: "Remove the accesskey attribute.",
    };

    const result = await applyFindingFix({
      findingId: "PAT-2a9053",
      patternPayload: { findings: [finding] },
      projectDir: dir,
      ai: { apiKey: "test-key" },
    });

    expect(result.applied).toBe(false);
    expect(result.message).not.toBe("Already resolved by a prior fix.");
  });

  it("recognizes a no-op as already resolved even when a nearby comment mentions the pattern (PAT-7a09a5 regression)", async () => {
    // Simulates PAT-7a09a5: a sibling DOM fix already added alt to this img,
    // so Claude echoes a no-op. The line above is a descriptive comment that
    // literally contains "<img>" — the img-no-alt regex must not false-match
    // on that comment text when checking whether the real tag is still broken.
    writeFile(
      dir,
      "index.html",
      '<!-- image-alt: <img> with no alt attribute at all -->\n<img src="hero.png" className="block" alt="Placeholder image" />\n',
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              changes: [{ filePath: "index.html", search: '<img src="hero.png" className="block" alt="Placeholder image" />', replace: '<img src="hero.png" className="block" alt="Placeholder image" />' }],
            }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const finding = {
      id: "PAT-7a09a5",
      pattern_id: "img-no-alt",
      title: "Image is missing an alt attribute",
      severity: "Critical",
      file: "index.html",
      line: 2,
      match: "<img",
      context: '<img src="hero.png" className="block" />',
      fix_description: "Add an alt attribute.",
    };

    const result = await applyFindingFix({
      findingId: "PAT-7a09a5",
      patternPayload: { findings: [finding] },
      projectDir: dir,
      ai: { apiKey: "test-key" },
    });

    expect(result.applied).toBe(true);
    expect(result.message).toBe("Already resolved by a prior fix.");
  });
});

// ── Post-patch syntax validation (build-breaking patch regression) ──────────

describe("applyFindingsFix — post-patch syntax validation", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("rejects and rolls back a patch that leaves the file with invalid TSX syntax", async () => {
    // Mirrors the real bug: a batch patch left a stray extra `}` after the
    // component function, which only Turbopack's build caught previously.
    const original = 'export default function Layout({ children }) {\n  return (\n    <div className="wrapper">\n      {children}\n    </div>\n  );\n}\n';
    writeFile(dir, "layout.tsx", original);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              changes: [{ filePath: "layout.tsx", search: "  );\n}", replace: "  );\n}\n}", findingId: "A11Y-1" }],
            }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1", selector: "div" })]),
      ai: { apiKey: "test-key" },
    });

    expect(results[0].status).toBe("not_applied");
    expect(results[0].message).toContain("invalid syntax");
    expect(fs.readFileSync(`${dir}/layout.tsx`, "utf8")).toBe(original);
  });

  it("in a mixed batch, rolls back only the finding whose patch breaks syntax and keeps the valid one applied", async () => {
    const original = 'export default function Page() {\n  return (\n    <div>\n      <img src="hero.png" />\n      <img src="other.png" />\n    </div>\n  );\n}\n';
    writeFile(dir, "page.tsx", original);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              changes: [
                { filePath: "page.tsx", search: '<img src="hero.png" />', replace: '<img src="hero.png" alt="Hero" />', findingId: "A11Y-1" },
                { filePath: "page.tsx", search: '<img src="other.png" />', replace: '<img src="other.png" alt="Other"', findingId: "A11Y-2" },
              ],
            }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1", "A11Y-2"],
      projectDir: dir,
      findingsPayload: makePayload([
        makeFinding({ id: "A11Y-1", selector: "img" }),
        makeFinding({ id: "A11Y-2", selector: "img" }),
      ]),
      ai: { apiKey: "test-key" },
    });

    const r1 = results.find((r) => r.id === "A11Y-1");
    const r2 = results.find((r) => r.id === "A11Y-2");
    expect(r1.status).toBe("patched");
    expect(r2.status).toBe("not_applied");
    expect(r2.message).toContain("invalid syntax");

    const finalContent = fs.readFileSync(`${dir}/page.tsx`, "utf8");
    expect(finalContent).toContain('alt="Hero"');
    expect(finalContent).not.toContain('alt="Other"');
  });

  it("does not run the syntax check on non-JS/TS files", async () => {
    writeFile(dir, "index.html", "<img src='hero.png'/>\n");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              changes: [{ filePath: "index.html", search: "<img src='hero.png'/>", replace: "<img src='hero.png' alt=''/>" }],
            }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const { results } = await applyFindingsFix({
      findingIds: ["A11Y-1"],
      projectDir: dir,
      findingsPayload: makePayload([makeFinding({ id: "A11Y-1" })]),
      ai: { apiKey: "test-key" },
    });

    expect(results[0].status).toBe("patched");
  });

  it("rejects and rolls back a single-finding (PAT) patch that leaves the file with invalid syntax", async () => {
    const original = 'export default function Widget() {\n  return (\n    <button accesskey="s">Submit</button>\n  );\n}\n';
    writeFile(dir, "widget.tsx", original);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({ changes: [{ filePath: "widget.tsx", search: "  );\n}", replace: "  );\n}\n}" }] }),
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    );

    const finding = {
      id: "PAT-x",
      pattern_id: "character-key-shortcut",
      title: "Single-character accesskey shortcut with no override mechanism",
      severity: "Moderate",
      file: "widget.tsx",
      line: 3,
      match: 'accesskey="s"',
      context: '<button accesskey="s">Submit</button>',
      fix_description: "Remove the accesskey attribute.",
    };

    const result = await applyFindingFix({
      findingId: "PAT-x",
      patternPayload: { findings: [finding] },
      projectDir: dir,
      ai: { apiKey: "test-key" },
    });

    expect(result.applied).toBe(false);
    expect(result.message).toContain("invalid syntax");
    expect(fs.readFileSync(`${dir}/widget.tsx`, "utf8")).toBe(original);
  });
});
