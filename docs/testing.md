# Testing Strategy

**Navigation**: [Home](../README.md) • [Architecture](architecture.md) • [Intelligence](intelligence.md) • [API Reference](api-reference.md) • [CLI Handbook](cli-handbook.md) • [Output Artifacts](outputs.md) • [Engine Manifest](engine-manifest.md) • [Testing](testing.md)

---

## Table of Contents

- [Overview](#overview)
- [Test Categories](#test-categories)
- [Run Commands](#run-commands)

## Overview

- **Framework**: Vitest
- **Command**: `pnpm test`
- **Current suite**: 8 files, 26 tests

The suite focuses on regression protection for architecture changes, public API contracts, and critical report-generation paths.

## Test Categories

### 1) Asset loading and compatibility

- `tests/asset-loader.test.mjs`
- Verifies all asset groups load correctly.
- Verifies compatibility alias: `ASSET_PATHS.engine` -> `ASSET_PATHS.scanning`.

### 2) Enrichment and summary contracts

- `tests/enriched-findings.test.mjs`
- `tests/audit-summary.test.mjs`
- Verifies canonicalization, normalization, sorting, effort inference, quick wins, and detected stack output.

### 3) Report API and import safety

- `tests/reports-api.test.mjs`
- `tests/reports-paths.test.mjs`
- Verifies report APIs return expected output types and protects against broken relative imports after refactors.

### 4) Source-pattern behavior

- `tests/source-patterns.test.mjs`
- `tests/source-scanner-utils.test.mjs`
- Verifies edge behavior for pattern filtering and source scanner utility functions.

### 5) Integration tests (no network)

- `tests/run-audit.integration.test.mjs`
- Mocks scanner/analyzer modules to verify:
  - `runAudit` progress event order
  - scanner/analyzer wiring
  - output payload shape

## Run Commands

```bash
# Full suite
pnpm test

# Run a single file
pnpm vitest run tests/run-audit.integration.test.mjs
```
