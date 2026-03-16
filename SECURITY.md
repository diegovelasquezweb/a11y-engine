# Security Policy

## Reporting a Vulnerability

We take the security and integrity of the a11y engine seriously. Please do not open a public GitHub issue for security vulnerabilities.

Use [GitHub's private vulnerability reporting](https://github.com/diegovelasquezweb/a11y-engine/security/advisories/new) to submit a report confidentially. Include a detailed description of the issue, clear steps to reproduce, and potential impact analysis.

Confirmed vulnerabilities will be addressed with a high-priority patch and credited to the researcher in the changelog (unless anonymity is preferred).

## Execution Scope & Safety

The a11y engine operates under a **local-first** security model:

- **Local Execution**: The engine runs entirely on the host machine. It does not transmit audit data, snapshots, or source code to external servers.
- **Controlled Environment**: Internal pipeline files are stored in the engine's own directory. User-facing reports are only generated on demand at a user-chosen location.
- **Sandboxing Notes**:
  - The engine executes `node` scripts from its own directory. Ensure you only install from trusted sources.
