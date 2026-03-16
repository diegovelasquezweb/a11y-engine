# Security Policy

## Reporting a Vulnerability

We take the security and integrity of the a11y engine seriously. Please do not open a public GitHub issue for security vulnerabilities.

Use [GitHub's private vulnerability reporting](https://github.com/diegovelasquezweb/a11y-engine/security/advisories/new) to submit a report confidentially. Include a detailed description of the issue, clear steps to reproduce, and potential impact analysis.

Confirmed vulnerabilities will be addressed with a high-priority patch and credited to the researcher in the changelog (unless anonymity is preferred).

## Execution Scope & Safety

The a11y engine operates under a **local-first** security model with opt-in external integrations:

- **Local Execution**: The core scan pipeline (axe-core, CDP, pa11y, analyzer) runs entirely on the host machine. Scan results and reports are never transmitted automatically.
- **Controlled Environment**: Internal pipeline files are stored in the engine's own `.audit/` directory. User-facing reports are only generated on demand at a user-chosen location.
- **External Network Access (opt-in only)**:
  - **GitHub API** — When `repoUrl` or `githubToken` is provided, the engine fetches `package.json` and source files from GitHub via the public REST API (`api.github.com` and `raw.githubusercontent.com`). Only the files needed for stack detection and source pattern scanning are fetched. No audit results are sent to GitHub.
  - **Anthropic API (AI enrichment)** — When `ai.enabled: true` and `ai.apiKey` are set (or `ANTHROPIC_API_KEY` env var is present), the engine sends Critical and Serious finding descriptions and, when a `repoUrl` is configured, relevant source file contents to the Anthropic API. Do not enable AI enrichment if your findings or source code contain sensitive data that must not leave your infrastructure.
- **Sandboxing Notes**:
  - The engine executes `node` scripts from its own directory. Ensure you only install from trusted sources.
  - Review your `ai.apiKey` and `githubToken` scopes — use read-only tokens wherever possible.
