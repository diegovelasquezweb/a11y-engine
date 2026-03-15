import { describe, expect, it } from "vitest";
import {
  getKnowledge,
  getPersonaReference,
  getScannerHelp,
  getUiHelp,
} from "../src/index.mjs";

describe("knowledge APIs", () => {
  it("returns scanner help with engines and advanced options", () => {
    const help = getScannerHelp();

    expect(help.locale).toBe("en");
    expect(help.title).toBe("Scanner Help");
    expect(help.engines.length).toBeGreaterThanOrEqual(3);
    expect(help.options.some((o) => o.id === "maxRoutes")).toBe(true);
  });

  it("returns persona explanations with mapping metadata", () => {
    const ref = getPersonaReference();

    expect(ref.personas.length).toBeGreaterThan(0);
    expect(ref.personas.some((p) => p.id === "screenReader")).toBe(true);
    expect(ref.personas.every((p) => Array.isArray(p.mappedRules))).toBe(true);
  });

  it("returns ui tooltips and glossary", () => {
    const ui = getUiHelp();

    expect(ui.tooltips.scoreGauge.title).toBeTruthy();
    expect(ui.glossary.length).toBeGreaterThan(0);
  });

  it("returns complete knowledge package", () => {
    const knowledge = getKnowledge();

    expect(knowledge.scanner.engines.length).toBeGreaterThan(0);
    expect(knowledge.personas.length).toBeGreaterThan(0);
    expect(knowledge.tooltips.quickWins.title).toBeTruthy();
  });

  it("falls back to English when locale is unavailable", () => {
    const knowledge = getKnowledge({ locale: "es" });

    expect(knowledge.locale).toBe("en");
  });
});
