import { describe, expect, it } from "vitest";
import { buildPatternAiInput } from "../src/fixes/apply-finding-fix.mjs";

const baseFinding = {
  id: "PAT-a919b9",
  title: "Focus outline suppressed",
  severity: "critical",
  pattern_id: "focus-outline-suppressed",
  file: "about.html",
  line: 94,
  match: 'style="outline: none',
  context: '      <button style="outline: none; padding: 8px 16px;">Learn more</button>',
  fix_description: "Remove outline: none from the style attribute and restore focus visibility.",
  fix_code: "",
};

const baseCandidate = {
  abs: "/project/about.html",
  rel: "about.html",
  content: '<button style="outline: none; padding: 8px 16px;">Learn more</button>',
};

describe("buildPatternAiInput — CSS candidate injection", () => {
  it("includes only the HTML file when no cssFiles are provided", () => {
    const aiInput = buildPatternAiInput({ finding: baseFinding, candidate: baseCandidate });
    expect(aiInput.files).toHaveLength(1);
    expect(aiInput.files[0].filePath).toBe("about.html");
  });

  it("includes CSS files alongside the HTML candidate when cssFiles are provided", () => {
    const cssFiles = [
      { rel: "style.css", content: "body { margin: 0; }" },
      { rel: "theme.scss", content: ".btn { color: red; }" },
    ];
    const aiInput = buildPatternAiInput({ finding: baseFinding, candidate: baseCandidate, cssFiles });
    expect(aiInput.files).toHaveLength(3);
    expect(aiInput.files.map((f) => f.filePath)).toContain("style.css");
    expect(aiInput.files.map((f) => f.filePath)).toContain("theme.scss");
  });

  it("HTML candidate is always first in files array", () => {
    const cssFiles = [{ rel: "style.css", content: "body {}" }];
    const aiInput = buildPatternAiInput({ finding: baseFinding, candidate: baseCandidate, cssFiles });
    expect(aiInput.files[0].filePath).toBe("about.html");
  });

  it("CSS file content is included and truncated to 12000 chars", () => {
    const longContent = "a".repeat(20000);
    const cssFiles = [{ rel: "style.css", content: longContent }];
    const aiInput = buildPatternAiInput({ finding: baseFinding, candidate: baseCandidate, cssFiles });
    const cssEntry = aiInput.files.find((f) => f.filePath === "style.css");
    expect(cssEntry).toBeDefined();
    expect(cssEntry.content.length).toBe(12000);
  });
});
