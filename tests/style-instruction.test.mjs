import { describe, expect, it } from "vitest";
import { buildStyleInstruction } from "../src/fixes/apply-finding-fix.mjs";

describe("buildStyleInstruction", () => {
  describe("css styling system", () => {
    it("includes dual-change instruction for inline HTML style violations", () => {
      const instruction = buildStyleInstruction("css");
      expect(instruction).toMatch(/two changes/i);
      expect(instruction).toMatch(/inline.*style.*attribute/i);
      expect(instruction).toMatch(/:focus-visible/);
    });

    it("mentions removing outline from HTML attribute as step 1", () => {
      const instruction = buildStyleInstruction("css");
      expect(instruction).toMatch(/remove.*outline.*HTML/i);
    });

    it("mentions adding :focus-visible rule in CSS/SCSS as step 2", () => {
      const instruction = buildStyleInstruction("css");
      expect(instruction).toMatch(/:focus-visible.*CSS/i);
    });
  });

  describe("tailwind styling system", () => {
    it("instructs to remove inline outline: none and use focus-visible: classes", () => {
      const instruction = buildStyleInstruction("tailwind");
      expect(instruction).toMatch(/focus-visible:/i);
      expect(instruction).toMatch(/remove.*outline.*none/i);
      expect(instruction).toMatch(/style.*attribute/i);
    });
  });

  describe("inline styling system", () => {
    it("instructs to remove outline: none from the style attribute", () => {
      const instruction = buildStyleInstruction("inline");
      expect(instruction).toMatch(/remove/i);
      expect(instruction).toMatch(/outline.*none|outline.*0/i);
    });
  });
});
