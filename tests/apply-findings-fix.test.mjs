import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyFindingsFix, FIX_ERROR_CODES } from "../src/index.mjs";

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
