import { describe, expect, it } from "vitest";
import { getSourcePatterns } from "../../src/index.mjs";

describe("getSourcePatterns", () => {
  it("returns empty summary when onlyPattern does not exist", async () => {
    const result = await getSourcePatterns("/path/does/not/matter", {
      onlyPattern: "this-pattern-does-not-exist",
    });

    expect(result.findings).toEqual([]);
    expect(result.summary).toEqual({ total: 0, confirmed: 0, potential: 0 });
  });
});
