# ANPOS Agent Router

`AGENTS.md` is intentionally small. The detailed protocol is modular. Read `.ai/manifest.json`, determine the active role from the user's request + repository state, then load the manifest's **common** files and only the applicable **role** files.

## Authority

1. explicit current user instruction
2. repository safety, consent, security, and GitHub governance
3. this router
4. manifest-selected role protocols
5. approved architecture/decisions/plan
6. repository/Git/test reality

Repository reality overrides stale chat memory, Linear mirrors, dashboards, or JSON mirrors. Never invent completion, capabilities, approvals, branches, PRs, tests, merges, emails, rulesets, or background execution.

## Instance bootstrap

Read `config/protocol/instance.json` immediately. A child repository copied from the template must be initialized with `scripts/bootstrap_instance.py` before development scales. The script is dry-run by default and refuses to reset the upstream template source unless explicitly overridden.

Do not allow a child project to inherit source-template Linear IDs, coordination leases, Worker claims, alerts, consent records, merge generations, or stale runtime identity.

## First user flow

For an uninitialized project: offer **Start Development** (native action/button when supported, exact-text fallback otherwise), then collect one free-form **Idea / Thoughts / Plan / Research / Search / Assumptions** input. Follow `START-HERE.md` for discovery, public research, market comparison, comparable-system audit, reasoning, and planning.

## Engineering lifecycle

Use `DEVELOPMENT-LIFECYCLE.md` for system design, technology recommendation, explicit technology-stack consent, architecture, data flow, UI/UX, implementation/DevOps, SQA, and authorized defensive security engineering.

Material technology/scope changes require the applicable consent record. Security, privacy, accessibility, observability, operability, testing, and rollback are cross-cutting requirements.

## Repository-backed project memory

Use `AI-NATIVE-EXECUTION.md` plus `config/ai/` and `config/traceability/requirements-traceability.json` to know what is planned, complete, partial, blocked, update-required, deprecated, verified, and releasable.

Planning hierarchy remains:

**Project → Phase/Milestone → Module → Work Unit → Acceptance/Verification**

A requirement is not verified merely because code exists. Maintain traceability from requirement → option → module → work unit → branch/PR → test evidence → release.

## Multi-agent invariants

Use `MULTI-AGENT-ORCHESTRATION.md` plus role protocols.

### Worker

A Worker reads `AUTO-AGENT.md` and the current queue/alerts. It must not start substantive work until it owns an atomic claim.

`config/coordination/agent-work-queue.json` is a mirror; the distributed arbitration point is the deterministic GitHub claim ref defined by the queue protocol and `scripts/claim_slot.py`. First successful ref creation wins. Claimed/in-progress slots require a live lease, coordination epoch, and fencing token. Expired claims are reconciled by the Supervisor from Git/PR evidence before reuse.

Completed Worker handoff remains exactly:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

### Supervisor

There is one active Supervisor per coordination epoch. Supervisor execution is governed by `SUPERVISOR.md` and `ORCHESTRATOR.md`.

The Supervisor must acquire an epoch-fenced lease using the deterministic election ref (`scripts/supervisor_lease.py` or equivalent). Every shared coordination write/reassignment/review/merge decision must verify the current fencing token. A stale Supervisor becomes read-only. Failover requires an expired/relinquished lease plus repository reconciliation.

A durable AI Supervisor service is a runtime capability, not something a markdown file magically provides. If no persistent runtime exists, record degraded mode and continue safely on subsequent invocations rather than pretending continuous execution occurred.

## Merge synchronization

Every successful main merge updates merge generation/event state and creates required-action reconciliation for affected active Workers. Stale Workers integrate current main, resolve conflicts, rerun impacted verification, acknowledge current generation, then continue.

## GitHub governance and ownership

Use `GITHUB-GOVERNANCE.md`, `config/github/ruleset-policy.json`, `config/github/path-ownership.json`, and `.github/CODEOWNERS`.

When an authenticated admin-capable interface is available and authorized, apply desired repository rules/settings and re-read GitHub to verify enforcement. Otherwise record governance drift; a local policy file is not proof of active GitHub protection.

Sensitive/shared paths require the configured owner/reviewer discipline. Child repositories should regenerate CODEOWNERS during bootstrap with identities valid for that repository.

## Quality and security

Use `CODE-QUALITY.md`, `SECURITY.md`, and `config/quality/quality-policy.json`. Required checks cannot be silently skipped. External GitHub Actions must be pinned to full commit SHAs. After stack approval, add mature stack-specific format/lint/static/type/test/build/dependency/security gates and relevant E2E/accessibility/performance/migration/container/IaC/license/coverage checks.

Unauthorized attacks, credential theft, destructive third-party actions, malware, or security testing outside authorized scope are forbidden.

## Linear

GitHub is canonical for code, branches, commits, PRs, merge state, `config/ai/`, `config/coordination/`, and README/runtime state. Linear is the planning/progress mirror. Reconcile on startup/resume and material events; hourly sync only when a persistent runtime truly exists. If issue quota blocks creation, use project status/document fallback.

## Continuous improvement and protocol updates

Use `CONTINUOUS-IMPROVEMENT.md` for technology/innovation loops. Use `config/protocol/version.json`, `config/protocol/migrations.json`, and the protocol-update watcher for upstream ANPOS changes. Protocol migrations must be impact-analyzed and must not blindly overwrite project-specific implementation or approved architecture.

## Clarification rule

Do not ask the user to choose work that repository evidence can determine. Ask only for genuine unresolved product/business/legal/ethical/consent/risk/preference decisions that materially block correct progress.
