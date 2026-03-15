import { describe, expect, it } from "vitest";
import { getEnrichedFindings } from "../../src/index.mjs";

function makeFinding(overrides = {}) {
  return {
    id: "F-1",
    rule_id: "unknown-rule",
    title: "Test finding",
    severity: "Moderate",
    url: "https://example.com",
    selector: "body",
    ...overrides,
  };
}

describe("getEnrichedFindings", () => {
  it("creates camelCase aliases and keeps snake_case fields", () => {
    const input = [makeFinding({ rule_id: "image-alt", screenshot_path: "shot.png" })];
    const out = getEnrichedFindings(input);

    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("image-alt");
    expect(out[0].rule_id).toBe("image-alt");
    expect(out[0].screenshotPath).toBe("shot.png");
    expect(out[0].screenshot_path).toBe("shot.png");
  });

  it("applies screenshotUrlBuilder when provided", () => {
    const input = [makeFinding({ screenshot_path: "abc.png" })];
    const out = getEnrichedFindings(input, {
      screenshotUrlBuilder: (raw) => `/api/screenshot?path=${raw}`,
    });

    expect(out[0].screenshotPath).toBe("/api/screenshot?path=abc.png");
  });

  it("canonicalizes pa11y rules using equivalence map", () => {
    const input = [
      makeFinding({
        source: "pa11y",
        rule_id: "Principle1.Guideline1_1.1_1_1.H37",
      }),
    ];
    const out = getEnrichedFindings(input);
    expect(out[0].ruleId).toBe("image-alt");
  });

  it("infers effort based on available fix code", () => {
    const high = getEnrichedFindings([makeFinding({ rule_id: "unknown-without-fix", fix_code: null })]);
    const low = getEnrichedFindings([makeFinding({ rule_id: "unknown-with-fix", fix_code: "<div></div>" })]);

    expect(high[0].effort).toBe("high");
    expect(low[0].effort).toBe("low");
  });

  it("sorts by severity order then by id", () => {
    const out = getEnrichedFindings([
      makeFinding({ id: "B", severity: "Minor" }),
      makeFinding({ id: "A", severity: "Critical" }),
      makeFinding({ id: "C", severity: "Critical" }),
    ]);

    expect(out.map((f) => f.id)).toEqual(["A", "C", "B"]);
  });
});
