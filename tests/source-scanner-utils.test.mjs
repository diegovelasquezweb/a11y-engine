import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("source-scanner CLI entry point (symlink regression)", () => {
  it("runs main() when invoked through a symlinked path, like pnpm's node_modules layout", () => {
    const dir = mkdtempSync(join(tmpdir(), "a11y-scanner-symlink-"));
    try {
      const realDir = join(dir, "real");
      mkdirSync(realDir, { recursive: true });
      const scannerRealPath = new URL("../src/source-patterns/source-scanner.mjs", import.meta.url).pathname;

      const symlinkPath = join(dir, "scanner-via-symlink.mjs");
      symlinkSync(scannerRealPath, symlinkPath);

      const targetDir = join(dir, "target");
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, "Page.jsx"), '<img src="hero.jpg">\n', "utf-8");

      const outputPath = join(dir, "findings.json");
      execFileSync("node", [symlinkPath, "--project-dir", targetDir, "--output", outputPath], {
        cwd: dir,
      });

      expect(existsSync(outputPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
