/**
 * Unit tests for mergeViolations() — cross-engine (axe-core / CDP / pa11y)
 * deduplication by live-DOM element identity rather than selector text.
 *
 * A fake `resolveIdentities` resolver stands in for the real Playwright-backed
 * one: it maps each input selector string to the DOM identity path(s) it
 * would resolve to, without needing a real browser.
 */

import { describe, expect, it } from "vitest";
import { mergeViolations } from "../src/pipeline/dom-scanner.mjs";

function fakeResolver(map) {
  return async (selectors) => selectors.map((sel) => map[sel] || []);
}

function axeViolation(id, target) {
  return { id, nodes: [{ target: [target] }] };
}

function cdpViolation(id, target) {
  return { id, nodes: [{ target: [target] }] };
}

function pa11yViolation(id, target) {
  return { id, nodes: [{ target: [target] }] };
}

describe("mergeViolations", () => {
  it("always keeps axe violations (baseline)", async () => {
    const axe = [axeViolation("button-name", ".btn")];
    const merged = await mergeViolations(axe, [], [], fakeResolver({ ".btn": ["BODY:0>BUTTON:2"] }));
    expect(merged).toHaveLength(1);
  });

  it("drops a CDP violation that resolves to the same element as an axe-equivalent rule", async () => {
    const axe = [axeViolation("button-name", ".bg-gray-300:nth-child(11)")];
    const cdp = [cdpViolation("cdp-missing-accessible-name", "#main > button")];
    const merged = await mergeViolations(
      axe,
      cdp,
      [],
      fakeResolver({
        ".bg-gray-300:nth-child(11)": ["BODY:0>BUTTON:10"],
        "#main > button": ["BODY:0>BUTTON:10"],
      }),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("button-name");
  });

  it("keeps a CDP violation when it resolves to a different element (no real duplicate)", async () => {
    const axe = [axeViolation("button-name", ".save-btn")];
    const cdp = [cdpViolation("cdp-missing-accessible-name", ".cancel-btn")];
    const merged = await mergeViolations(
      axe,
      cdp,
      [],
      fakeResolver({
        ".save-btn": ["BODY:0>BUTTON:1"],
        ".cancel-btn": ["BODY:0>BUTTON:2"],
      }),
    );
    expect(merged).toHaveLength(2);
  });

  it("drops a pa11y violation fully covered by an axe-equivalent rule (via pa11y-config equivalenceMap)", async () => {
    const axe = [axeViolation("button-name", ".bg-gray-300:nth-child(11)")];
    const pa11y = [pa11yViolation("Principle4.Guideline4_1.4_1_2.H91.Button", "#main > div > button:nth-child(11)")];
    const merged = await mergeViolations(
      axe,
      [],
      pa11y,
      fakeResolver({
        ".bg-gray-300:nth-child(11)": ["BODY:0>BUTTON:10"],
        "#main > div > button:nth-child(11)": ["BODY:0>BUTTON:10"],
      }),
    );
    expect(merged).toHaveLength(1);
  });

  it("keeps a pa11y violation in full when it only PARTIALLY overlaps an already-seen element", async () => {
    // Real-world shape: pa11y bundles a comma-separated selector covering the
    // already-flagged button PLUS genuinely new, unflagged inputs.
    const axe = [axeViolation("button-name", ".bg-gray-300:nth-child(11)")];
    const pa11y = [
      pa11yViolation(
        "Principle4.Guideline4_1.4_1_2.H91.Button",
        "#main input:nth-child(5), #main input:nth-child(6), #main button:nth-child(11)",
      ),
    ];
    const merged = await mergeViolations(
      axe,
      [],
      pa11y,
      fakeResolver({
        ".bg-gray-300:nth-child(11)": ["BODY:0>BUTTON:10"],
        "#main input:nth-child(5), #main input:nth-child(6), #main button:nth-child(11)": [
          "BODY:0>INPUT:4",
          "BODY:0>INPUT:5",
          "BODY:0>BUTTON:10",
        ],
      }),
    );
    // Not dropped — inputs 4 and 5 are new information the button-only axe finding never covered.
    expect(merged).toHaveLength(2);
  });

  it("never drops a violation whose selector could not be resolved (empty identity set)", async () => {
    const axe = [axeViolation("button-name", ".btn")];
    const cdp = [cdpViolation("cdp-missing-accessible-name", ".btn-that-vanished")];
    const merged = await mergeViolations(
      axe,
      cdp,
      [],
      fakeResolver({ ".btn": ["BODY:0>BUTTON:1"], ".btn-that-vanished": [] }),
    );
    expect(merged).toHaveLength(2);
  });

  it("keeps a pa11y violation with no rule in the equivalence map", async () => {
    const axe = [axeViolation("button-name", ".btn")];
    const pa11y = [pa11yViolation("Principle1.Guideline1_3.1_3_1.SomeUnmappedRule", ".btn")];
    const merged = await mergeViolations(
      axe,
      [],
      pa11y,
      fakeResolver({ ".btn": ["BODY:0>BUTTON:1"] }),
    );
    expect(merged).toHaveLength(2);
  });
});
