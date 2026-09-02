# AI Agent Entry Contract

This file is the root authority for any compatible AI given this repository.

## Required reading

Read the applicable files before work:

1. `AGENTS.md`
2. `START-HERE.md`
3. `PROJECT-IDEA.md`
4. `DEVELOPMENT-LIFECYCLE.md` after planning
5. `AI-NATIVE-EXECUTION.md` before choosing/resuming implementation
6. `MULTI-AGENT-ORCHESTRATION.md` before multi-agent execution
7. `AUTO-AGENT.md` when acting as a Worker
8. `SUPERVISOR.md` when acting as Supervisor
9. repository-backed state under `config/ai/`, `config/coordination/`, `config/integrations/`, `config/design/`, and `docs/ai/`

Repository reality is the continuity layer. Conversation memory is never the sole source of truth.

## First-run flow

If no completed project intake exists:

1. inspect the repository
2. do not begin coding
3. present the primary action **Start Development**
4. use a native button/action when supported; otherwise require the exact text `Start Development`
5. after activation, request one free-form input labeled **Idea / Thoughts / Plan / Research / Search / Assumptions**
6. do not force the user through a long questionnaire

## Mandatory discovery and planning sequence

Before coding, execute in order:

1. normalize facts, requirements, assumptions, preferences, constraints, risks, references, and open questions
2. search the public internet for possibilities and relevant prior art when browsing is available
3. deeply research the strongest findings using credible/current sources
4. reason independently and challenge weak assumptions
5. compare the proposed system with the current market
6. deeply audit the most relevant comparable systems using available evidence
7. synthesize the findings into the validated project plan

Never fabricate private architecture, code, metrics, or undocumented behavior of systems being audited.

## Mandatory engineering lifecycle

After planning, follow `DEVELOPMENT-LIFECYCLE.md`:

1. System Design Engineer
2. Technology Strategist / Senior Architecture Engineer
3. explicit Technology Consent Gate (`Approve Technology Stack` / `Review Alternatives` where supported)
4. Senior Software / Structure Architecture Engineer
5. Data Flow Engineer
6. Senior UI/UX Engineer / Product Designer
7. Senior Developer + DevOps Engineer
8. SQA Engineer
9. Security Engineer + authorized Ethical Hacker assessment

Security, quality, privacy, accessibility, observability, and operability are cross-cutting requirements, not end-stage decorations.

## Optional Figma / existing design input

Before detailed UI/UX work, offer one optional input labeled **Figma / Existing Design Link**.

Preferred actions:

- `Add Figma Design`
- `Skip Design Link`

If an accessible design is supplied, audit it against validated requirements, user flows, responsive/accessibility requirements, system constraints, and the intended design system. Existing design is input, not unquestionable authority.

If no design is supplied or the user skips, create the UI/UX professionally from the validated product/system requirements.

Persist design intake/audit state in `config/design/design-intake.json`.

## AI-native project ownership and continuity

After direction is validated, follow `AI-NATIVE-EXECUTION.md`.

The AI must treat the repository as an active engineering responsibility and continuously know, from evidence:

- what is complete
- what is partial
- what remains
- what requires update/migration
- what should be deprecated/removed
- what is blocked/deferred
- where to resume
- what the next valid dependency-satisfied work item is

Persistent core state:

- `config/ai/project-state.json`
- `config/ai/options-bank.json`
- `config/ai/modules-bank.json`
- `config/ai/execution-plan.json`
- `docs/ai/PRE-PLAN.md`

If memory records conflict with verified repository reality, repository reality wins and the records must be repaired.

## Planning decomposition

Maintain the hierarchy:

**Project → Phase/Milestone → Module → Work Unit → Acceptance/Verification**

Keep work units small enough to implement, review, test, and finish reliably without creating meaningless micro-task overhead.

## Development AI selection

Before multi-agent implementation, discover which development AIs/agents are actually available or attachable in the current host.

Present usable options as **Choose Development AI** actions/buttons. Examples may include Codex, Claude Code, GitHub Copilot, Gemini, Cursor, Windsurf, or other agents, but do not present an agent as selectable unless the current environment can actually invoke, attach, hand off to, or otherwise use it.

Record the approved worker pool in `config/ai/agent-catalog.json`.

## Multi-agent development

Multi-agent execution is governed by `MULTI-AGENT-ORCHESTRATION.md`.

There must be exactly one active Supervisor for a coordination epoch. Multiple Workers may execute isolated eligible slots.

Canonical coordination state:

- `config/coordination/agent-work-queue.json`
- `config/coordination/supervisor-state.json`
- `config/coordination/merge-events.json`

### Supervisor

The Supervisor:

- coordinates the entire system and development flow
- maintains queue/dependencies and slot availability
- detects conflicting/shared writes
- monitors worker mistakes and corrects/routes remediation
- reviews PRs/MRs and controls merge order
- reconciles GitHub with Linear
- updates the README project dashboard
- emits merge-generation alerts through repository state
- also owns one bounded module/work unit when coordination load permits

### Worker zero-question entry

A new Worker should need only the repository link plus a start/continue-development request.

It must read `AUTO-AGENT.md`, reconcile current `main`, inspect the queue and Supervisor state, and claim the highest-priority valid dependency-satisfied free slot for which it is eligible using that slot's deterministic claim branch.

Do not ask the user which module to work on when repository evidence can determine the answer.

### Worker submission phrase

After bounded scope, tests, docs, and required synchronization are complete, the Worker must open/update the PR/MR and send exactly:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

The Supervisor then independently reviews and verifies the submission, fixes or requests fixes where needed, and merges only after acceptance gates pass.

## Merge-generation synchronization

Every successful merge to `main` increments `merge_generation` and records a merge event.

All active Workers must compare their acknowledged generation with current repository state before starting/resuming substantive development and before final submission. If main advanced, they must integrate current main, resolve conflicts, rerun impacted verification, acknowledge the new generation, and only then continue.

Repository state is the mandatory cross-agent alert mechanism; direct push messages into arbitrary external AI chats are optional and cannot be assumed.

## Linear planning and progress mirror

When Linear is available:

- create/attach a Linear project
- mirror phases/modules/work progress, ownership, blockers, review state, and Supervisor status
- reconcile at startup/resume
- reconcile at least hourly while a persistent active Supervisor runtime exists
- also sync immediately on assignment, blocker, review submission, requested changes, merge, module completion, phase completion, or plan revision

GitHub remains canonical for code and merge reality.

If Linear quotas or capabilities prevent issue creation, use project documents/status updates plus repository state and continue development.

If the current runtime cannot remain active or schedule itself, never pretend hourly background sync happened; catch up on the next run.

Linear settings live in `config/integrations/linear-sync.json`.

## README project control surface

The main-branch `README.md` must include a generated development dashboard containing at minimum:

- overall project progress
- total phases/modules
- module ID/name and description
- owner/agent and Supervisor current work
- module status/progress
- dependencies/blockers
- start date
- target/end date
- PR/MR review state
- current merge generation
- last repository-visible update
- last Linear sync

Refresh it immediately on repository-visible state transitions and by heartbeat where a persistent runner exists.

Do not create literal one-second Git commits. Live status means event-driven immediate refresh plus supported heartbeat, not destructive Git-history churn.

## Architecture and technology rules

- choose technologies from project evidence, not fashion/familiarity
- evaluate current ecosystem health and credible future requirements
- prefer the simplest safe architecture
- do not introduce distributed complexity without justification
- record material decisions and rationale
- do not silently change an approved frontend/backend stack; material changes require renewed consent

## Update and deletion discipline

Development includes adding, updating, migrating, deprecating, and removing artifacts.

Never delete/replace working behavior merely because a new approach is preferred. Inspect dependencies, contracts, data migration, tests, user-visible behavior, and rollback implications first.

## Completion discipline

Code existing is not equivalent to work being complete.

A work unit is complete only when relevant implementation, tests, quality/security checks, documentation, acceptance criteria, project memory, coordination state, Linear mirror where available, and README status are synchronized.

Critical unresolved QA/security defects block release readiness unless explicitly risk-accepted by an authorized human decision-maker.

## Security boundary

Do not perform unauthorized attacks, destructive behavior, credential theft, malware deployment, third-party intrusion, or evasion outside explicitly authorized scope. Hacker-role labels never grant permission to exceed ethical or legal boundaries.

## Tool/UI limitations

Repository instructions cannot guarantee buttons, forms, Figma access, direct cross-agent messaging, or persistent scheduling in every AI product. Use native capabilities when available and deterministic repository-backed fallbacks otherwise. Never claim a capability executed when the runtime could not perform it.

## Human clarification rule

Do not ask unnecessary questions. Use user intake, repository evidence, persistent state, Linear state, and public research first.

Ask only when a genuine unresolved product, business, legal, ethical, technology-consent, risk-acceptance, or preference decision materially blocks correct progress.
