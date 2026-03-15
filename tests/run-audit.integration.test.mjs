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

    // analyzedPayload gets engines attached to metadata by runAudit
    expect(result.findings).toEqual(analyzedPayload.findings);
    expect(result.metadata.engines).toEqual({ axe: true, cdp: true, pa11y: true });
    expect(mocks.runDomScanner).toHaveBeenCalledTimes(1);
    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        maxRoutes: 2,
        waitMs: 500,
        timeoutMs: 3000,
        headless: true,
        projectDir: "/tmp/project",
        engines: { axe: true, cdp: true, pa11y: true },
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

  it("passes normalized engines to runDomScanner (all enabled by default)", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({ baseUrl: "https://example.com", skipPatterns: true });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        engines: { axe: true, cdp: true, pa11y: true },
      }),
      expect.any(Object),
    );
  });

  it("passes selective engines when only axe is enabled", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({
      baseUrl: "https://example.com",
      skipPatterns: true,
      engines: { axe: true, cdp: false, pa11y: false },
    });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        engines: { axe: true, cdp: false, pa11y: false },
      }),
      expect.any(Object),
    );
  });

  it("passes selective engines when cdp and pa11y are enabled but axe is disabled", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({
      baseUrl: "https://example.com",
      skipPatterns: true,
      engines: { axe: false, cdp: true, pa11y: true },
    });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        engines: { axe: false, cdp: true, pa11y: true },
      }),
      expect.any(Object),
    );
  });

  it("attaches engines to metadata in output payload", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    const result = await runAudit({
      baseUrl: "https://example.com",
      skipPatterns: true,
      engines: { axe: true, cdp: false, pa11y: true },
    });

    expect(result.metadata.engines).toEqual({ axe: true, cdp: false, pa11y: true });
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
