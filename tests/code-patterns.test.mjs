import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanPattern, isConfirmedByContext } from "../src/source-patterns/source-scanner.mjs";
import codePatterns from "../assets/remediation/code-patterns.mjs";

const NEW_PATTERN_IDS = [
  "div-onclick",
  "icon-btn-no-label",
  "img-no-alt",
  "icon-no-aria-hidden",
  "async-no-aria-live",
  "input-no-autocomplete",
  "focus-vs-focus-visible",
  "transition-all",
  "img-no-dimensions",
  "no-prefers-reduced-motion",
  "spellcheck-on-sensitive",
];

const DROPPED_PATTERN_IDS = [
  "touch-action-missing",
  "scroll-margin-top-anchors",
  "transform-origin-svg",
];

function byId(id) {
  const pattern = codePatterns.patterns.find((p) => p.id === id);
  if (!pattern) throw new Error(`Pattern "${id}" not found in code-patterns.mjs`);
  return pattern;
}

function matches(pattern, sample) {
  return new RegExp(pattern.regex, "gi").test(sample);
}

describe("code-patterns: schema", () => {
  it("contains all 11 new PAT-* ids alongside the 7 existing ones", () => {
    const ids = codePatterns.patterns.map((p) => p.id);
    expect(ids.length).toBe(18);
    for (const id of NEW_PATTERN_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("does not include the deferred file-scope patterns", () => {
    const ids = codePatterns.patterns.map((p) => p.id);
    for (const id of DROPPED_PATTERN_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  it("each new entry matches the existing entries' key shape and a valid wcag_level", () => {
    const referenceKeys = Object.keys(byId("character-key-shortcut")).sort();
    for (const id of NEW_PATTERN_IDS) {
      const entry = byId(id);
      expect(Object.keys(entry).sort()).toEqual(referenceKeys);
      expect(["A", "AA", "AAA", ""]).toContain(entry.wcag_level);
    }
  });
});

describe("PAT-div-onclick", () => {
  it("flags a clickable div with no interactive role", () => {
    expect(matches(byId("div-onclick"), '<div onclick="handleClick()">Click me</div>')).toBe(true);
  });

  it("does not match a real button element", () => {
    expect(matches(byId("div-onclick"), '<button onclick="handleClick()">Click me</button>')).toBe(false);
  });

  it("downgrades when role=button appears within 2 lines", () => {
    const lines = ['<div onclick="handleClick()">', '  role="button"', '  Click me'];
    expect(isConfirmedByContext(byId("div-onclick"), lines, 0)).toBe(false);
  });

  it("confirms when no role is present nearby", () => {
    const lines = ['<div onclick="handleClick()">', '  Click me', '</div>'];
    expect(isConfirmedByContext(byId("div-onclick"), lines, 0)).toBe(true);
  });
});

describe("PAT-icon-btn-no-label", () => {
  it("flags an icon-only button with no accessible name", () => {
    expect(
      matches(byId("icon-btn-no-label"), '<button onClick={handleClick}><svg width="16" height="16"></svg></button>')
    ).toBe(true);
  });

  it("does not match when aria-label is present on the same tag", () => {
    expect(
      matches(
        byId("icon-btn-no-label"),
        '<button aria-label="Close" onClick={handleClick}><svg width="16" height="16"></svg></button>'
      )
    ).toBe(false);
  });

  it("downgrades when aria-label appears within 4 lines", () => {
    const lines = ['<button onClick={handleClick}>', '  <svg width="16" height="16"></svg>', '  aria-label="Close"'];
    expect(isConfirmedByContext(byId("icon-btn-no-label"), lines, 0)).toBe(false);
  });
});

describe("PAT-img-no-alt", () => {
  it("flags an img with no alt attribute", () => {
    expect(matches(byId("img-no-alt"), '<img src="hero.jpg">')).toBe(true);
  });

  it("downgrades when alt= appears within 2 lines", () => {
    const lines = ['<img src="hero.jpg" alt="Hero banner">'];
    expect(isConfirmedByContext(byId("img-no-alt"), lines, 0)).toBe(false);
  });

  it("confirms when no alt is present nearby", () => {
    const lines = ['<img src="hero.jpg">'];
    expect(isConfirmedByContext(byId("img-no-alt"), lines, 0)).toBe(true);
  });
});

describe("PAT-icon-no-aria-hidden", () => {
  it("flags a bare svg icon with no hiding/labeling attribute", () => {
    expect(matches(byId("icon-no-aria-hidden"), '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>')).toBe(true);
  });

  it("downgrades when aria-hidden appears within 3 lines", () => {
    const lines = ['<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M0 0"/></svg>'];
    expect(isConfirmedByContext(byId("icon-no-aria-hidden"), lines, 0)).toBe(false);
  });

  it("confirms when no reject token is present nearby", () => {
    const lines = ['<svg viewBox="0 0 24 24">', '  <path d="M0 0"/>', '</svg>'];
    expect(isConfirmedByContext(byId("icon-no-aria-hidden"), lines, 0)).toBe(true);
  });
});

describe("PAT-async-no-aria-live", () => {
  it("flags a toast/notification region with no live-region marker", () => {
    expect(matches(byId("async-no-aria-live"), '<div className="toast-message">Saved!</div>')).toBe(true);
  });

  it("downgrades when aria-live or role=status/alert appears within 4 lines", () => {
    const lines = ['<div className="toast-message" role="status">Saved!</div>'];
    expect(isConfirmedByContext(byId("async-no-aria-live"), lines, 0)).toBe(false);
  });

  it("confirms when no live-region marker is present nearby", () => {
    const lines = ['<div className="toast-message">Saved!</div>'];
    expect(isConfirmedByContext(byId("async-no-aria-live"), lines, 0)).toBe(true);
  });
});

describe("PAT-input-no-autocomplete", () => {
  it("flags an identity input with no autocomplete attribute", () => {
    expect(matches(byId("input-no-autocomplete"), '<input type="email" name="email">')).toBe(true);
  });

  it("downgrades when autocomplete= appears on the adjacent line", () => {
    const lines = ['<input type="email" name="email" autocomplete="email">'];
    expect(isConfirmedByContext(byId("input-no-autocomplete"), lines, 0)).toBe(false);
  });

  it("confirms when autocomplete is not present nearby", () => {
    const lines = ['<input type="email" name="email">'];
    expect(isConfirmedByContext(byId("input-no-autocomplete"), lines, 0)).toBe(true);
  });
});

describe("PAT-focus-vs-focus-visible", () => {
  it("flags a :focus rule", () => {
    expect(matches(byId("focus-vs-focus-visible"), ".btn:focus { outline: 2px solid blue; }")).toBe(true);
  });

  it("does not match a :focus-visible rule", () => {
    expect(matches(byId("focus-vs-focus-visible"), ".btn:focus-visible { outline: 2px solid blue; }")).toBe(false);
  });
});

describe("PAT-transition-all", () => {
  it("flags transition: all", () => {
    expect(matches(byId("transition-all"), "transition: all 0.3s ease;")).toBe(true);
  });

  it("does not match a specific transition property", () => {
    expect(matches(byId("transition-all"), "transition: opacity 0.3s ease;")).toBe(false);
  });

  it("requires no manual verification and has no context_reject_regex", () => {
    const pattern = byId("transition-all");
    expect(pattern.requires_manual_verification).toBe(false);
    expect(pattern.context_reject_regex).toBeNull();
  });
});

describe("PAT-img-no-dimensions", () => {
  it("flags an img with no width attribute", () => {
    expect(matches(byId("img-no-dimensions"), '<img src="hero.jpg">')).toBe(true);
  });

  it("downgrades when width= appears within 2 lines", () => {
    const lines = ['<img src="hero.jpg" width="800" height="600">'];
    expect(isConfirmedByContext(byId("img-no-dimensions"), lines, 0)).toBe(false);
  });

  it("confirms when no dimension/Image/fill marker is present nearby", () => {
    const lines = ['<img src="hero.jpg">'];
    expect(isConfirmedByContext(byId("img-no-dimensions"), lines, 0)).toBe(true);
  });
});

describe("PAT-no-prefers-reduced-motion", () => {
  it("flags a stylesheet with keyframes and no reduced-motion query anywhere in the file", () => {
    const lines = ["@keyframes spin { from { transform: rotate(0deg); } }", ...Array(50).fill("body { color: red; }")];
    expect(matches(byId("no-prefers-reduced-motion"), lines[0])).toBe(true);
    expect(isConfirmedByContext(byId("no-prefers-reduced-motion"), lines, 0)).toBe(true);
  });

  it("downgrades when prefers-reduced-motion appears anywhere in the file (whole-file window)", () => {
    const lines = [
      "@keyframes spin { from { transform: rotate(0deg); } }",
      ...Array(50).fill("body { color: red; }"),
      "@media (prefers-reduced-motion: reduce) { * { animation: none; } }",
    ];
    expect(isConfirmedByContext(byId("no-prefers-reduced-motion"), lines, 0)).toBe(false);
  });
});

describe("PAT-spellcheck-on-sensitive", () => {
  it("flags a password input with no spellcheck attribute", () => {
    expect(matches(byId("spellcheck-on-sensitive"), '<input type="password" name="password">')).toBe(true);
  });

  it("downgrades when spellcheck=false appears within 2 lines", () => {
    const lines = ['<input type="password" name="password" spellcheck="false">'];
    expect(isConfirmedByContext(byId("spellcheck-on-sensitive"), lines, 0)).toBe(false);
  });

  it("confirms when spellcheck is not present nearby", () => {
    const lines = ['<input type="password" name="password">'];
    expect(isConfirmedByContext(byId("spellcheck-on-sensitive"), lines, 0)).toBe(true);
  });
});

describe("code-patterns: co-fire scenarios (real scanPattern, real temp files)", () => {
  let dir;

  function withTempFile(fileName, content, fn) {
    dir = mkdtempSync(join(tmpdir(), "a11y-code-patterns-"));
    const filePath = join(dir, fileName);
    writeFileSync(filePath, content, "utf-8");
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("img-no-alt and img-no-dimensions both fire on the same bare <img> line, no dedup", () => {
    withTempFile("Banner.jsx", '<img src="hero.jpg">\n', (scanDir) => {
      const altFindings = scanPattern(byId("img-no-alt"), scanDir);
      const dimensionFindings = scanPattern(byId("img-no-dimensions"), scanDir);

      expect(altFindings).toHaveLength(1);
      expect(dimensionFindings).toHaveLength(1);
      expect(altFindings[0].line).toBe(dimensionFindings[0].line);
      expect(altFindings[0].pattern_id).toBe("img-no-alt");
      expect(dimensionFindings[0].pattern_id).toBe("img-no-dimensions");
    });
  });

  it("input-no-autocomplete and spellcheck-on-sensitive both fire on the same identity input line, no dedup", () => {
    withTempFile("Contact.jsx", '<input type="email" name="email">\n', (scanDir) => {
      const autocompleteFindings = scanPattern(byId("input-no-autocomplete"), scanDir);
      const spellcheckFindings = scanPattern(byId("spellcheck-on-sensitive"), scanDir);

      expect(autocompleteFindings).toHaveLength(1);
      expect(spellcheckFindings).toHaveLength(1);
      expect(autocompleteFindings[0].line).toBe(spellcheckFindings[0].line);
      expect(autocompleteFindings[0].pattern_id).toBe("input-no-autocomplete");
      expect(spellcheckFindings[0].pattern_id).toBe("spellcheck-on-sensitive");
    });
  });
});
