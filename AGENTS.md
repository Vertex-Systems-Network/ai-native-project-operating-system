# ANPOS Agent Router

`AGENTS.md` is intentionally small. The detailed protocol is modular. Read `.ai/manifest.json`, determine the active role from the user's request + repository state, then load the manifest's **common** files and only the applicable **role** files.

## Authority

1. explicit current user instruction
2. canonical-template-source vs child-project boundary
3. repository safety, consent, security, and GitHub governance
4. this router
5. manifest-selected role protocols
6. approved architecture/decisions/plan
7. repository/Git/test reality

Repository reality overrides stale chat memory, Linear mirrors, dashboards, or JSON mirrors. Never invent completion, capabilities, approvals, branches, PRs, tests, merges, emails, rulesets, integrations, or background execution.

## Template source boundary — mandatory

Read both the actual current repository identity and `config/protocol/instance.json` immediately.

Canonical upstream source:

`Vertex-Systems-Network/ai-native-project-operating-system`

- If the current repository **is the canonical upstream source** and its instance state is `template_source`, this repository is an **inert reusable template/protocol source**, not a live application project.
- If the current repository is **different from the canonical upstream source** but inherited `instance_status: template_source`, it is an **uninitialized child repository** and must be bootstrapped rather than treated as the source template.
- If the current repository is a child with `instance_status: active_project`, reconcile and resume its existing setup/state; do not blindly reset it.

Against the canonical source repository, do not:

- connect or map a real Linear project;
- write project-specific Linear IDs/URLs/sync timestamps;
- apply child-project GitHub Rules/rulesets/merge settings;
- activate child-project code-quality/runtime workflows;
- treat blueprint configuration as proof that anything is already applied.

The canonical source stores instructions, policies, schemas, scripts, and inactive blueprints only.

For a new/child repository, load `PROJECT-INITIALIZATION.md` and run the child initialization flow.

## Child instance bootstrap

A child repository copied from the template must be initialized with `scripts/bootstrap_instance.py` before development scales. The script is dry-run by default and refuses to reset the canonical upstream source unless deliberately overridden for testing.

A child project must not inherit source-template Linear IDs, coordination leases, Worker claims, alerts, consent records, merge generations, stale runtime identity, or source-specific integration state.

After child bootstrap, complete `PROJECT-INITIALIZATION.md`:

1. connect/authenticate Linear using the host's secure connected-app/OAuth flow; never ask for a raw password/token in normal chat;
2. map/create the Linear project and enable verified auto-sync only in the child repository;
3. install/apply the universal Code Quality baseline to the child automatically, then add stack-specific quality tooling after technology approval;
4. ask the user whether to **Apply Recommended GitHub Rules**; if admin-capable and approved, apply + re-read + verify, otherwise provide the exact manual setup and keep it pending.

## First user flow

For an uninitialized child project: offer **Start Development** (native action/button when supported, exact-text fallback otherwise), complete the child-project initialization contract, then collect one free-form **Idea / Thoughts / Plan / Research / Search / Assumptions** input. Follow `START-HERE.md` for discovery, public research, market comparison, comparable-system audit, reasoning, and planning.

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

Use `PROJECT-INITIALIZATION.md`, `GITHUB-GOVERNANCE.md`, `config/github/ruleset-policy.json`, `config/github/path-ownership.json`, and `.github/CODEOWNERS`.

The ruleset policy is a **child-project blueprint**. Ask for the project-start Rules decision. When an authenticated admin-capable interface is available and the user approves, apply desired repository rules/settings and re-read GitHub to verify enforcement. Otherwise provide exact manual actions and record pending state. A policy file is not proof of active protection.

Sensitive/shared paths require the configured owner/reviewer discipline. Child repositories should regenerate CODEOWNERS during bootstrap with identities valid for that repository.

## Quality and security

Use `PROJECT-INITIALIZATION.md`, `CODE-QUALITY.md`, `SECURITY.md`, and `config/quality/quality-policy.json`.

The quality policy and files under `blueprints/github/` are **inactive source templates**. They are installed into active `.github/` paths only in child projects. The universal baseline is applied automatically during child initialization; after stack approval, add mature stack-specific format/lint/static/type/test/build/dependency/security gates and relevant E2E/accessibility/performance/migration/container/IaC/license/coverage checks.

Required checks cannot be silently skipped after they are installed. External GitHub Actions must be pinned to full commit SHAs.

Unauthorized attacks, credential theft, destructive third-party actions, malware, or security testing outside authorized scope are forbidden.

## Linear

`config/integrations/linear-sync.json` is a **connection blueprint** in the canonical template source, not an attached project.

In each child project, the AI must ask the user to **Connect Linear** through the host's secure connection/authentication UI, then map or create the appropriate Linear project and persist that mapping only in the child repository. GitHub is canonical for code, branches, commits, PRs, and merge reality; Linear is the planning/progress mirror. Reconcile on startup/resume and material events; hourly sync only when a persistent runtime truly exists.

## Continuous improvement and protocol updates

Use `CONTINUOUS-IMPROVEMENT.md` for technology/innovation loops. Child runtime workflow blueprints live under `blueprints/github/workflows/` and become active only after child initialization installs them. Use `config/protocol/version.json`, `config/protocol/migrations.json`, and the protocol-update blueprint for upstream ANPOS changes. Protocol migrations must not blindly overwrite project-specific implementation or approved architecture.

## Clarification rule

Do not ask the user to choose work that repository evidence can determine. Ask only for genuine unresolved product/business/legal/ethical/consent/risk/preference decisions that materially block correct progress.
