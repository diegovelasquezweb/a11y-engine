import { describe, expect, it } from "vitest";
import { getKnowledge } from "../src/index.mjs";

describe("knowledge API", () => {
  it("returns scanner help with engines and advanced options", () => {
    const { scanner } = getKnowledge();

    expect(scanner.title).toBe("Scanner Help");
    expect(scanner.engines.length).toBeGreaterThanOrEqual(3);
    expect(scanner.options.some((o) => o.id === "maxRoutes")).toBe(true);
  });

  it("returns persona explanations with mapping metadata", () => {
    const { personas } = getKnowledge();

    expect(personas.length).toBeGreaterThan(0);
    expect(personas.some((p) => p.id === "screenReader")).toBe(true);
    expect(personas.every((p) => Array.isArray(p.mappedRules))).toBe(true);
  });

  it("returns concepts and glossary", () => {
    const { concepts, glossary } = getKnowledge();

    expect(concepts.score.title).toBeTruthy();
    expect(glossary.length).toBeGreaterThan(0);
  });

  it("returns conformance levels with axe tag mappings", () => {
    const { conformanceLevels } = getKnowledge();

    expect(conformanceLevels.length).toBeGreaterThanOrEqual(3);
    expect(conformanceLevels.some((l) => l.id === "AA")).toBe(true);
    expect(conformanceLevels.every((l) => Array.isArray(l.tags))).toBe(true);
  });

  it("returns WCAG principles", () => {
    const { wcagPrinciples } = getKnowledge();

    expect(wcagPrinciples.length).toBe(4);
    expect(wcagPrinciples.some((p) => p.id === "perceivable")).toBe(true);
  });

  it("returns severity levels with ordering", () => {
    const { severityLevels } = getKnowledge();

    expect(severityLevels.length).toBeGreaterThanOrEqual(4);
    expect(severityLevels.some((s) => s.id === "Critical")).toBe(true);
    expect(severityLevels.every((s) => typeof s.order === "number")).toBe(true);
  });

  it("returns complete knowledge package", () => {
    const knowledge = getKnowledge();

    expect(knowledge.locale).toBe("en");
    expect(knowledge.scanner.engines.length).toBeGreaterThan(0);
    expect(knowledge.personas.length).toBeGreaterThan(0);
    expect(knowledge.concepts.quickWins.title).toBeTruthy();
    expect(knowledge.docs.sections.length).toBeGreaterThan(0);
  });

  it("falls back to English when locale is unavailable", () => {
    const knowledge = getKnowledge({ locale: "es" });

    expect(knowledge.locale).toBe("en");
  });
});
