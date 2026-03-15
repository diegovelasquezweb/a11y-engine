import { describe, expect, it } from "vitest";
import { parseExtensions, resolveScanDirs } from "../src/source-patterns/source-scanner.mjs";

describe("source-scanner utilities", () => {
  it("extracts extensions from glob patterns", () => {
    const exts = parseExtensions(["**/*.tsx", "**/*.ts", "**/*.jsx"]);
    expect([...exts].sort()).toEqual([".jsx", ".ts", ".tsx"]);
  });

  it("returns project root when framework is unknown", () => {
    const dirs = resolveScanDirs("unknown-framework", "/tmp/project");
    expect(dirs).toEqual(["/tmp/project"]);
  });

  it("resolves framework boundaries for known framework", () => {
    const dirs = resolveScanDirs("nextjs", "/tmp/project");
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs.every((d) => d.startsWith("/tmp/project"))).toBe(true);
  });
});
