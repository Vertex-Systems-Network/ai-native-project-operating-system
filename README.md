# AI Native Project Operating System

A repository-first operating system for turning a raw idea into a researched, designed, engineered, tested, security-hardened, stateful, multi-agent, continuously improving, and governance-enforced AI-native software project.

## First-run experience

When a user gives this repository URL to an AI, the AI reads `AGENTS.md` and initializes the project flow.

1. **Start Development** — offer `Start Development` as the primary action/button when supported; otherwise use the exact text fallback.
2. **Project Intake** — collect one free-form **Idea / Thoughts / Plan / Research / Search / Assumptions** input.
3. **Discover → Research → Reason** — search the internet, research the strongest possibilities, and challenge assumptions.
4. **Market Compare → Deep Audit Existing Systems** — compare the idea with current products/competitors and deeply audit the most useful comparable systems.
5. **Synthesize → Plan** — revise the project plan from evidence rather than merely restating the user's first idea.
6. **System Design** — design system boundaries, actors, subsystems, integrations, non-functional requirements, reliability, scalability, security, privacy, observability, deployment, and extension points.
7. **Technology Recommendation + Consent** — compare frontend/backend/database/infrastructure/testing/deployment options and obtain explicit `Approve Technology Stack` consent before detailed implementation architecture/coding.
8. **Development Architecture** — define repository/module boundaries, contracts, persistence, APIs, state, testing architecture, CI/CD, deployment topology, rollback, and engineering conventions.
9. **Data Flow Design** — design end-to-end data movement, stores, transformations, integrations, trust boundaries, failure/retry, retention/deletion, and audit paths.
10. **Professional UI/UX** — audit optional Figma/existing design input or create the product design from requirements.
11. **Development + DevOps** — implement frontend, backend, persistence, integrations, tests, infrastructure, CI/CD, observability, deployment, and synchronized docs.
12. **SQA** — validate static quality, unit/integration/contract/E2E/regression/responsive/accessibility/performance/failure/deployment/recovery behavior.
13. **Security Engineering** — perform authorized defensive threat modeling and adversarial hardening.
14. **AI-Native Project Ownership** — AI treats the repository as an active engineering responsibility, not disconnected prompts.
15. **Repository Memory Bank** — persist what is done, partial, blocked, remaining, update-required, removal/deprecation-required, and where to resume.
16. **Pre-Plan + Options Bank + Modules Bank** — document the system first and attach reusable options/capabilities to stable modules.
17. **Phase → Module → Small Work Unit** — decompose large phases into small dependency-aware slices that are easy to implement, review, test, and finish.
18. **Linear Planning + Hourly Sync** — mirror phases/modules/progress, ownership, blockers, reviews, and Supervisor state to Linear; reconcile at least hourly while an active persistent Supervisor runtime exists and immediately on material events.
19. **Choose Development AI** — discover only agents actually available/attachable in the current host and present usable choices as buttons/actions.
20. **Multi-Agent Development** — execute multiple isolated module/work-unit slots concurrently under repository-backed coordination.
21. **One Supervisor** — exactly one active Supervisor owns project-wide coordination, review, merge ordering, worker correction, state reconciliation, and overall development oversight.
22. **Worker Auto-Routing** — a new worker only needs the repo link/start request; it reads `AUTO-AGENT.md` and deterministically claims the highest-priority valid free eligible slot.
23. **Review Handoff** — completed workers submit PR/MR and send exactly `ALL DONE SUBMITTED FOR REVIEW AND MERGE`.
24. **Supervisor Review/Fix/Merge** — Supervisor independently validates each submission, requests or applies bounded fixes, reruns checks, and merges only when gates pass. Supervisor-authored high-risk changes require independent review.
25. **Merge-Generation Alert** — every main merge increments repository merge generation and creates a required-action alert for active/affected workers. Workers must integrate current main, reverify, acknowledge the alert, and only then continue.
26. **Supervisor Also Develops** — when coordination load permits, Supervisor owns one bounded module/work unit as well without bypassing independent-review safeguards.
27. **Optional Figma Input** — offer **Figma / Existing Design Link** with `Add Figma Design` and `Skip Design Link` actions; audit supplied design when accessible.
28. **AI-Created Design Fallback** — if no design exists or the user skips, AI creates the professional UI/UX from validated requirements.
29. **Main README Control Surface** — repository-visible state transitions immediately refresh the main-branch dashboard; supported persistent runtimes may also heartbeat-refresh it. Literal one-second Git commits are intentionally forbidden.
30. **Plan/Module Progress Table** — README tracks module descriptions, owners, progress, dates, blockers, review state, merge generation, and required-action alerts.
31. **24-Hour Technology Update Watch** — after stack approval/post-stack execution begins, GitHub schedules a daily Supervisor audit request. AI researches meaningful framework/runtime/dependency/platform/security updates, creates an impact/migration/test/rollback plan, alerts the Supervisor, notifies the configured owner by authorized email, obtains explicit consent, then implements only the approved scope and fully retests it.
32. **Optional 25-Hour Innovation Scout** — disabled by default. After explicit owner opt-in, GitHub performs an hourly lightweight due-check and creates a market/options/modules research request only after at least 25 hours. AI researches new useful capabilities/options/modules/systems, presents selectable suggestions, and adds only owner-approved items back into the normal planning/architecture/QA/security development lifecycle.
33. **GitHub Governance / Rules** — AI continuously verifies repository rulesets and merge settings against `config/github/ruleset-policy.json`. When an authenticated admin-capable GitHub interface is available, it applies and re-verifies the desired default-branch protections automatically; otherwise it records governance drift instead of pretending the rules are active.
34. **Adaptive Code Quality** — universal repository integrity, dependency review, CodeQL-for-Actions, OpenSSF Scorecard, pinned Actions, and Dependabot are built into the template. After stack approval, AI selects and applies the best mature stack-specific formatter/linter/static-analysis/test/build/security tools and makes them part of the merge gates.

## Current project control surface

<!-- AI-PROJECT-DASHBOARD:START -->

**Overall protocol scope progress:** `████████████████████ 100%` — requirements 1–34 currently represented in the repository protocol.

**Current merge generation:** `0`  
**Open required-action agent alerts:** `0`  
**Technology update watch:** Configured; activates for post-stack project lifecycle  
**Innovation Scout:** `OFF` by default; explicit owner opt-in required  
**GitHub governance:** Desired policy recorded; current repository governance drift remains open until admin-capable rules/settings write is available  
**Universal quality gates:** Active; Repository Integrity and CodeQL verified passing on `main`  
**Linear project:** AI Native Project Operating System  
**Last repository-visible protocol update:** 2026-09-02 18:04 PKT  
**Last Linear sync:** 2026-09-02 17:48 PKT

| Module | Description | Owner | Status | Progress | Start | End/Target | Review / Blocker |
|---|---|---|---|---:|---|---|---|
| P01 | Start/intake, internet discovery, research, reasoning, market comparison, comparable-system audits, synthesis | AI | Complete | 100% | 2026-09-02 | 2026-09-02 | — |
| P02 | System design, stack selection/consent, architecture, data flow, UI/UX, development, QA, security | AI | Complete | 100% | 2026-09-02 | 2026-09-02 | — |
| P03 | AI-native ownership, memory bank, pre-plan, options/modules banks, small work-unit execution | AI | Complete | 100% | 2026-09-02 | 2026-09-02 | — |
| P04 | Linear planning/progress mirror and hourly/event-driven reconciliation protocol | Supervisor | Complete | 100% | 2026-09-02 | 2026-09-02 | Linear free issue quota reached; project status/milestone fallback active |
| P05 | Dynamic development-AI selection and multi-agent worker pool | Supervisor | Complete | 100% | 2026-09-02 | 2026-09-02 | Runtime agent availability discovered per host |
| P06 | Supervisor/worker queue, deterministic claims, PR/MR review, merge generation, required-action alert inbox, worker acknowledgement | Supervisor + Workers | Complete | 100% | 2026-09-02 | 2026-09-02 | — |
| P07 | Optional Figma/design intake and AI-created design fallback | UI/UX AI | Complete | 100% | 2026-09-02 | 2026-09-02 | Figma access depends on host connection |
| P08 | Main README generated progress/control dashboard | Supervisor | Complete | 100% | 2026-09-02 | 2026-09-02 | Event-driven refresh; no one-second commit churn |
| P09 | 24-hour technology update audit, owner notification/consent, controlled update implementation and full retest protocol | Supervisor + Maintenance Worker | Complete | 100% | 2026-09-02 | 2026-09-02 | Runtime AI/email callback availability handled by deterministic fallbacks |
| P10 | Optional 25-hour market/options/modules innovation scout with owner-selectable scope consent | Supervisor + Research AI | Complete | 100% | 2026-09-02 | 2026-09-02 | Disabled by default until explicit owner opt-in |
| P11 | GitHub ruleset/merge-governance desired policy, automated drift audit, and admin-capability auto-apply contract | Supervisor | Complete | 100% | 2026-09-02 | 2026-09-02 | Actual GitHub ruleset/settings write is not exposed by current connector; governance issue #1 tracks enforcement gap |
| P12 | Universal code-quality/security gates plus stack-adaptive tool-selection policy | Supervisor + SQA + Security | Complete | 100% | 2026-09-02 | 2026-09-02 | Repository Integrity + CodeQL verified passing; stack-specific gates generated after stack approval |

> For an actual project created from this operating system, this section becomes a generated runtime dashboard built from `config/ai/`, `config/coordination/`, `config/maintenance/`, `config/consent/`, `config/github/`, `config/quality/`, Git/PR state, and Linear state.

<!-- AI-PROJECT-DASHBOARD:END -->

## Repository-backed continuity

Persistent core artifacts:

- `config/ai/project-state.json` — where the project is now and where work resumes.
- `config/ai/options-bank.json` — reusable capability/option catalog.
- `config/ai/modules-bank.json` — canonical module catalog with attached option IDs.
- `config/ai/execution-plan.json` — dependency-aware phases/modules/work-unit graph.
- `config/ai/agent-catalog.json` — available/selected development-agent pool.
- `config/coordination/agent-work-queue.json` — deterministic multi-agent slots and claims.
- `config/coordination/supervisor-state.json` — Supervisor identity/status, merge generation, sync timestamps.
- `config/coordination/merge-events.json` — immutable-style cross-agent main-merge event log.
- `config/coordination/agent-alerts.json` — required-action merge/reconcile alerts and per-worker acknowledgements.
- `config/integrations/linear-sync.json` — Linear planning/progress mirror and sync policy.
- `config/design/design-intake.json` — optional Figma/design source and audit state.
- `config/maintenance/technology-watch.json` — 24-hour technology audit policy/state.
- `config/maintenance/innovation-scout.json` — optional 25-hour innovation-scout policy/state.
- `config/consent/consent-requests.json` — canonical maintenance/scope consent records.
- `config/notifications/project-owner.json` — safe project-owner notification/contact policy.
- `config/github/ruleset-policy.json` — desired default-branch governance and merge policy.
- `config/quality/quality-policy.json` — universal and stack-adaptive code-quality requirements.
- `docs/ai/PRE-PLAN.md` — living engineering pre-plan.

Repository/Git/test reality wins over stale memory records.

## Multi-agent execution model

The coordination hierarchy is:

**Supervisor → Phase/Milestone → Module Slot → Worker → PR/MR → Quality/Security Gates → Supervisor Review → Merge → Merge-Generation Alert → Worker Reconciliation/Acknowledgement**

Workers use isolated deterministic claim branches. The Supervisor owns shared coordination writes, review/merge order, Linear reconciliation, repository-backed alerts, maintenance requests, owner consent routing, governance/quality drift, and README status. Direct push messaging between arbitrary AI chats is not assumed; repository queue/alert/consent state and merge generation provide deterministic cross-agent coordination.

## Linear integration

This operating-system repository is mirrored in Linear under **AI Native Project Operating System**. GitHub remains canonical for code and merge reality.

Linear sync occurs:

- on Supervisor startup/resume
- at least hourly while a persistent active Supervisor runtime exists
- on assignments and blockers
- on review submission / requested changes
- on merges
- on module/phase completion
- on plan revisions
- on approved maintenance/innovation scope changes
- on governance or quality-policy drift/change

If Linear issue quota/capability is unavailable, project documents/status updates plus repository state are the fallback and development continues.

## Optional design intake

Before detailed UI/UX work:

- input: **Figma / Existing Design Link**
- action: `Add Figma Design`
- action: `Skip Design Link`

A supplied design is audited against validated flows, requirements, accessibility/responsiveness, and system constraints. If absent, AI designs the product itself.

## Continuous improvement

### 24-hour technology update watch

`.github/workflows/technology-update-watch.yml` schedules a daily durable Supervisor audit request after the project reaches a post-stack lifecycle stage. The Action itself does not silently edit dependencies.

The Supervisor researches current authoritative release/security/support sources, creates an impact and migration plan, records a consent request, and notifies the configured owner. Preferred authenticated email action is **Approve & Start Update** only when the host can securely record consent and trigger the approved work. Otherwise the canonical review surface / `APPROVE UPDATE <CONSENT-ID>` fallback is used.

After approval, the update goes through isolated implementation, relevant QA/security/regression/build/deployment/rollback verification, review, merge, README/memory update, and Linear reconciliation.

### Optional 25-hour innovation scout

The scout is `OFF` by default. Preferred activation actions are:

- `Enable 25-Hour Innovation Scout`
- `Keep Innovation Scout Off`

Because GitHub cron cannot express a true every-25-hours recurrence, `.github/workflows/innovation-scout.yml` performs an hourly lightweight due-check and creates a research request only after at least 25 hours and only when no earlier request remains open.

Research may discover new options/modules/systems, but those remain proposals until the owner selects/approves them. Approved additions re-enter the appropriate planning, design, architecture, security, QA, and multi-agent development flow.

## GitHub governance

`GITHUB-GOVERNANCE.md` and `config/github/ruleset-policy.json` define the desired repository rules. The AI must inspect actual GitHub state and, when its authenticated interface supports administration writes, apply and re-read the rules/settings automatically. When it cannot, governance drift remains explicit in GitHub rather than being represented as complete enforcement.

The current template prefers PR-only integration into `main`, independent review, required CI checks, up-to-date branches, resolved conversations, force-push/deletion protection, linear history, and squash merging. Merge queue is recommended when supported and worthwhile for the project's concurrency level.

## Code quality

`CODE-QUALITY.md` and `config/quality/quality-policy.json` define the quality system.

The universal template currently includes:

- `AI Native Quality Gates` — validates repository-backed AI state/reference integrity, workflow action pinning, JSON/YAML correctness, and machine-file hygiene.
- `Dependency Review` — blocks high-severity vulnerable dependency changes on pull requests.
- `CodeQL` — scans GitHub Actions workflow code with the `security-extended` query suite.
- `OpenSSF Scorecard` — periodically evaluates supply-chain/repository security posture.
- Dependabot — keeps GitHub Actions dependencies current.

All external GitHub Actions are pinned to full commit SHAs. After the application stack is approved, the AI must add the mature ecosystem-specific formatter, linter, static/type analysis, test, build, dependency-audit, and security gates appropriate to that stack, plus additional E2E/accessibility/performance/migration/container/IaC/license/coverage checks where relevant.

## Protocol files

- `AGENTS.md` — root authority and complete entry/coordination/maintenance/governance/quality contract.
- `START-HERE.md` — intake, research, market audit, and planning flow.
- `DEVELOPMENT-LIFECYCLE.md` — system design through QA/security.
- `AI-NATIVE-EXECUTION.md` — persistent ownership, memory, options/modules banks, and execution graph.
- `MULTI-AGENT-ORCHESTRATION.md` — Linear, AI selection, Supervisor/Worker coordination, merges, alerts, Figma, and dashboard rules.
- `AUTO-AGENT.md` — autonomous Worker entry, alert acknowledgement, and submission protocol.
- `SUPERVISOR.md` — Supervisor coordination/review/merge/maintenance/owner-consent protocol.
- `CONTINUOUS-IMPROVEMENT.md` — scheduled technology updates and optional market/options/modules innovation loops.
- `GITHUB-GOVERNANCE.md` — desired GitHub rulesets/merge settings and enforcement behavior.
- `CODE-QUALITY.md` — universal and stack-adaptive quality strategy.
- `SECURITY.md` — private vulnerability-reporting and AI security-handling policy.

## Start prompt

Give the repository URL to a compatible AI and say:

> Read this repository's AI instructions and initialize it.

The repository defines the remaining interaction.
