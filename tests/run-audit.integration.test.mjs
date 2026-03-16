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

  it("passes custom axeTags including best-practice and ACT to runDomScanner", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    const customTags = ["wcag2a", "wcag2aa", "best-practice", "ACT"];

    await runAudit({
      baseUrl: "https://example.com",
      skipPatterns: true,
      axeTags: customTags,
    });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        axeTags: customTags,
      }),
      expect.any(Object),
    );
  });

  it("passes clearCache option to runDomScanner", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({ baseUrl: "https://example.com", skipPatterns: true, clearCache: true });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({ clearCache: true }),
      expect.any(Object),
    );
  });

  it("clearCache defaults to false when not specified", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({ baseUrl: "https://example.com", skipPatterns: true });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({ clearCache: false }),
      expect.any(Object),
    );
  });

  it("passes serverMode option to runDomScanner", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({ baseUrl: "https://example.com", skipPatterns: true, serverMode: true });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({ serverMode: true }),
      expect.any(Object),
    );
  });

  it("serverMode defaults to false when not specified", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({ baseUrl: "https://example.com", skipPatterns: true });

    expect(mocks.runDomScanner).toHaveBeenCalledWith(
      expect.objectContaining({ serverMode: false }),
      expect.any(Object),
    );
  });

  it("does not include best-practice or ACT in axeTags by default", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({ findings: [], metadata: {} });

    await runAudit({ baseUrl: "https://example.com", skipPatterns: true });

    const call = mocks.runDomScanner.mock.calls[0][0];
    // When no axeTags provided, the scanner uses its own AXE_TAGS default
    // runAudit passes axeTags: null (undefined) — the dom-scanner applies its own default
    expect(call.axeTags == null || !call.axeTags.includes("best-practice")).toBe(true);
    expect(call.axeTags == null || !call.axeTags.includes("ACT")).toBe(true);
  });

  it("exposes passesCount, incompleteCount, inapplicableCount in metadata", async () => {
    mocks.runDomScanner.mockResolvedValue({ findings: [], metadata: {} });
    mocks.runAnalyzer.mockReturnValue({
      findings: [],
      metadata: {
        passesCount: 42,
        incompleteCount: 3,
        inapplicableCount: 17,
      },
      incomplete_findings: [],
    });

    const result = await runAudit({
      baseUrl: "https://example.com",
      skipPatterns: true,
    });

    expect(result.metadata).toHaveProperty("passesCount", 42);
    expect(result.metadata).toHaveProperty("incompleteCount", 3);
    expect(result.metadata).toHaveProperty("inapplicableCount", 17);
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
