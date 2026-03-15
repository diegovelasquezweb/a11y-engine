import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDomScanner: vi.fn(),
  runAnalyzer: vi.fn(),
}));

vi.mock("../src/pipeline/dom-scanner.mjs", () => ({
  runDomScanner: mocks.runDomScanner,
}));

vi.mock("../src/enrichment/analyzer.mjs", () => ({
  runAnalyzer: mocks.runAnalyzer,
}));

import { runAudit } from "../src/index.mjs";

describe("runAudit integration (mocked modules)", () => {
  beforeEach(() => {
    mocks.runDomScanner.mockReset();
    mocks.runAnalyzer.mockReset();
  });

  it("emits progress events in order and wires scanner/analyzer calls", async () => {
    const scanPayload = {
      findings: [{ id: "raw-1" }],
      metadata: { projectContext: { framework: "nextjs", cms: null, uiLibraries: [] } },
    };
    const analyzedPayload = {
      findings: [{ id: "enriched-1" }],
      metadata: { target_url: "https://example.com" },
    };

    mocks.runDomScanner.mockResolvedValue(scanPayload);
    mocks.runAnalyzer.mockReturnValue(analyzedPayload);

    const onProgress = vi.fn();
    const options = {
      baseUrl: "https://example.com",
      maxRoutes: 2,
      waitMs: 500,
      timeoutMs: 3000,
      headless: true,
      projectDir: "/tmp/project",
      skipPatterns: true,
      framework: "nextjs",
      ignoreFindings: ["color-contrast"],
      onProgress,
    };

    const result = await runAudit(options);

    expect(result).toEqual(analyzedPayload);
    expect(mocks.runDomScanner).toHaveBeenCalledTimes(1);
    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        maxRoutes: 2,
        waitMs: 500,
        timeoutMs: 3000,
        headless: true,
        projectDir: "/tmp/project",
      }),
      { onProgress },
    );

    expect(mocks.runAnalyzer).toHaveBeenCalledTimes(1);
    expect(mocks.runAnalyzer).toHaveBeenCalledWith(scanPayload, {
      ignoreFindings: ["color-contrast"],
      framework: "nextjs",
    });

    expect(onProgress.mock.calls).toEqual([
      ["page", "running"],
      ["intelligence", "running"],
      ["intelligence", "done"],
    ]);
  });

  it("returns expected payload shape when analyzer output includes incomplete findings", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [{ id: "raw-1" }], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({
      findings: [{ id: "enriched-1", severity: "Serious" }],
      metadata: {
        target_url: "https://example.com",
        projectContext: { framework: "nextjs", cms: null, uiLibraries: ["radix"] },
      },
      incomplete_findings: [{ id: "manual-1" }],
    });

    const output = await runAudit({
      baseUrl: "https://example.com",
      skipPatterns: true,
    });

    expect(output).toHaveProperty("findings");
    expect(Array.isArray(output.findings)).toBe(true);
    expect(output).toHaveProperty("metadata");
    expect(typeof output.metadata).toBe("object");
    expect(output).toHaveProperty("incomplete_findings");
    expect(Array.isArray(output.incomplete_findings)).toBe(true);
    expect(output.metadata.projectContext).toEqual({
      framework: "nextjs",
      cms: null,
      uiLibraries: ["radix"],
    });
  });
});
