# Security Policy

## Reporting a vulnerability

Do not disclose exploitable security issues in public issues, pull requests, logs, README dashboards, Linear mirrors, or agent coordination files.

Use GitHub private vulnerability reporting/security advisories when available, or another explicitly authorized private security channel configured by the project owner.

A report should include enough information to reproduce and assess the issue without including unnecessary secrets or unrelated sensitive data.

## AI and multi-agent handling

AI agents must:

- treat credentials, tokens, private keys, personal data, exploit details, and sensitive logs as restricted information;
- avoid copying secrets into prompts, repository state, issues, Linear, or README status;
- use the minimum information required for remediation;
- record public coordination state using sanitized references rather than exploit payloads or credentials;
- route critical/high findings through the Supervisor and authorized security review path;
- retest remediation before closure.

The authorized adversarial-testing scope is defined by the project and `DEVELOPMENT-LIFECYCLE.md`. No role label grants permission to test unrelated third-party systems.

## Supported versions

This template does not define application release versions itself. Projects generated from it must maintain their own supported-version/security-maintenance policy before production release.
