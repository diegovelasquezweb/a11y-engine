import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readReportFile(name) {
  const filePath = path.join(process.cwd(), "src", "reports", name);
  return fs.readFileSync(filePath, "utf8");
}

describe("report module import paths", () => {
  it("uses src-relative core imports from reports root", () => {
    const files = ["html.mjs", "md.mjs", "pdf.mjs", "checklist.mjs"];
    for (const file of files) {
      const content = readReportFile(file);
      expect(content).not.toContain('from "../../core/');
      expect(content).toContain('from "../core/');
    }
  });

  it("uses local renderer imports from reports root", () => {
    const files = ["html.mjs", "md.mjs", "pdf.mjs", "checklist.mjs"];
    for (const file of files) {
      const content = readReportFile(file);
      expect(content).not.toContain('from "../renderers/');
      expect(content).toContain('from "./renderers/');
    }
  });
});
