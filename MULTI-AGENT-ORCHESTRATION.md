# Multi-Agent Orchestration and Control Plane

This protocol governs requirements 18–30 after a project has a validated plan and executable module graph.

## 1. Canonical systems

- GitHub is authoritative for code, branches, commits, PR/MR state, merges, repository-backed memory, agent slots, and merge-generation state.
- Linear is the planning/progress mirror for phases, modules, assignments, blockers, review state, progress summaries, and Supervisor status.
- If Linear and GitHub disagree about code or merge reality, GitHub wins and Linear must be reconciled.

## 2. Linear planning and hourly synchronization

When Linear is available, create or attach a Linear project for the software project and mirror the approved Phase → Module → Work Unit plan.

During active development the Supervisor must reconcile GitHub ↔ Linear:

- at startup/resume
- at least once per hour while the Supervisor is actively running
- immediately after material events: claim, blocker, review submission, requested changes, merge, module completion, phase completion, or plan revision

If the host cannot run continuously or schedule work, record the missed heartbeat and perform catch-up reconciliation on the next Supervisor run. Never pretend a background sync occurred when no persistent runner existed.

## 3. Development AI selection

Before multi-agent implementation begins, discover which development agents/tools are actually available or attachable in the current host.

Present only usable choices as primary buttons/actions under **Choose Development AI**. Examples may include Codex, Claude Code, GitHub Copilot, Gemini, Cursor, Windsurf, or other capable agents, but an option may be selectable only when the current host can actually use, attach, invoke, or hand work to it.

Unavailable suggestions may be shown separately as recommendations, never as active buttons that imply integration exists.

Allow one or more compatible agent types to be selected for the worker pool. Record the approved pool in `config/ai/agent-catalog.json`.

## 4. Multi-agent operating model

There must be exactly one active **Supervisor** for a coordination epoch.

The Supervisor:

- owns whole-project coordination
- maintains the queue and dependency graph
- assigns/opens module slots
- detects conflicting/shared writes
- reviews worker submissions
- controls merge order
- reconciles Linear
- maintains README status
- also executes one bounded development module/work unit when coordination load permits

Workers:

- work only on claimed eligible slots
- use isolated branches
- keep scope bounded to the assigned module/work unit
- continuously reconcile with current main and merge generation
- submit PR/MR for Supervisor review

## 5. Worker zero-question entry

A new worker should need only the repository URL plus a request to start/continue development.

The worker must:

1. read `AGENTS.md`, `AUTO-AGENT.md`, `AI-NATIVE-EXECUTION.md`, and this file
2. fetch/reconcile current `main`
3. inspect `config/coordination/agent-work-queue.json`
4. inspect `config/coordination/supervisor-state.json`
5. inspect current merge generation
6. claim the highest-priority dependency-satisfied free slot allowed for its role/capabilities using the slot's deterministic claim branch
7. mirror/update the assignment in Linear when available
8. begin work without asking the user which module to choose unless repository evidence contains a genuine unresolved decision

The Supervisor does not need to push a message directly into arbitrary external AI chats. Repository-backed queue state is the deterministic assignment mechanism.

## 6. Slot and branch isolation

Every executable slot has a stable ID, module ID, priority, dependencies, eligibility, deterministic claim branch, status, claimant, base SHA, review reference, and Linear reference when available.

Recommended claim branch shape:

`agent/<slot-id>/<sanitized-module-name>`

A slot is claimable only when dependencies are satisfied and no valid active claim exists.

Shared coordination files should normally be Supervisor-owned. Workers should avoid writing shared state except through explicitly allowed claim/heartbeat/submission fields.

## 7. Worker completion and review handoff

When a worker has completed its bounded scope and all required checks pass, it must:

- synchronize against the required current main according to merge-generation rules
- push its branch
- open/update the PR/MR
- update queue and Linear review state when permitted
- send the exact completion state:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

The work is not merged merely because this message exists.

## 8. Supervisor review and merge

The Supervisor must independently inspect the PR/MR, changed files, tests, architecture fit, security/quality impact, shared-state conflicts, and current main.

If defects exist, the Supervisor must either request targeted changes or make bounded corrective changes where authorized and safe, then rerun relevant verification.

Merge only when acceptance gates pass and merge order is safe.

## 9. Merge-generation alert protocol

Every successful merge to main increments `merge_generation` in `config/coordination/supervisor-state.json` and appends a merge event to `config/coordination/merge-events.json`.

This is the authoritative cross-agent alert.

Before a worker starts or resumes implementation, before pushing a substantial continuation, and before final submission, it must compare its acknowledged generation to the current generation.

If main advanced, the worker must fetch and integrate/rebase/merge the required current main, resolve conflicts, rerun impacted tests, update its acknowledged generation, and only then continue.

Linear should receive a corresponding merge/rebase-needed status update when available.

## 10. Optional Figma/design intake

Before detailed UI/UX execution, offer an optional design input.

Preferred UI:

- text/URL box label: **Figma / Existing Design Link**
- primary action: `Add Figma Design`
- secondary action: `Skip Design Link`

If a Figma or other accessible design is supplied, the AI must audit it against validated requirements, flows, architecture, responsive/accessibility needs, and the approved design system before implementation. Existing design is evidence/input, not unquestionable authority.

If no design is supplied or the user skips, the AI must create the UI/UX professionally from the validated product/system requirements.

Record design source and audit state in `config/design/design-intake.json`.

## 11. README live development dashboard

The main-branch README is the human-readable project control surface.

It must contain a generated project dashboard with:

- overall project progress bar
- total phases and modules
- module ID/name
- description
- owner/agent
- Supervisor current work
- status
- progress percentage/bar
- dependencies/blockers
- start date
- target/end date
- PR/MR/review state
- current merge generation
- last repository-visible update
- last Linear sync

Refresh the dashboard immediately after every repository-visible state transition and at active-run heartbeat intervals where a persistent runner exists.

Do **not** create literal one-second Git commits. That would create destructive history churn and race conditions. "Live" means event-driven immediate updates, plus heartbeat refresh when supported.

## 12. Failure and degraded modes

- If Linear issue creation is unavailable or quota-limited, use a Linear project document/status update and repository state; do not block development.
- If direct cross-agent messaging is unavailable, queue state + merge generation + Linear mirror are the communication layer.
- If no external development-agent integration is available, the current capable AI may act as Supervisor and/or Worker while preserving role isolation.
- If Figma cannot be accessed, request an export only when required; otherwise design from requirements.

## 13. Completion discipline

Supervisor coordination is not complete until queue state, GitHub merge reality, Linear mirror, project memory, and README dashboard agree.
