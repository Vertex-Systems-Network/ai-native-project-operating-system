# AI Native Project Operating System

A reusable Git repository template/protocol for starting new AI-native software projects with structured research, planning, architecture, provider-agnostic project management, selectable development AIs, multi-agent development, quality, security, governance, project memory, and continuous improvement.

## Important: this repository is the template source

`Vertex-Systems-Network/ai-native-project-operating-system` is **not a live application project**.

The canonical source stays neutral and reusable:

- **Project Management:** no live provider/project is selected or connected.
- **Development AI:** no project-specific Supervisor/Worker pool is attached.
- **GitHub Rules:** child-project desired policy is stored, but project rules are not applied to this source by the ANPOS initialization flow.
- **Code Quality / runtime workflows:** stored as inactive blueprints under `blueprints/github/`; they are not active child-project automation on the canonical source.
- **Project progress:** the source template does not maintain a fake application-project completion dashboard.

Core boundary:

> **Canonical template source = instructions + provider catalogs + adapter contracts + reusable inactive blueprints. Child project = selected/connected integrations + selected AI pool + approved/applied rules + active quality/runtime automation + project-specific state.**

## How a new project uses this template

1. Create/copy a **new child Git repository** from this template.
2. Give the **child repository URL** to a compatible AI.
3. The AI reads `AGENTS.md`, `.ai/manifest.json`, `PROJECT-INITIALIZATION.md`, and actual repository identity.
4. If the child inherited `instance_status: template_source`, the AI runs child bootstrap rather than treating it as the canonical source.
5. Offer **Start Development**.
6. Run the child initialization flow below.

## Mandatory child-project initialization

### 1. Bootstrap the child instance

`scripts/bootstrap_instance.py` resets inherited runtime state, creates child identity, regenerates child CODEOWNERS, resets PM/AI selections, and installs normal child runtime/quality workflow blueprints into active `.github/` paths.

The script refuses to bootstrap the canonical source by default.

### 2. Choose Project Management System

ANPOS is **project-management-provider agnostic**.

Preferred selection surface:

**Choose Project Management System**

Candidate providers may include:

- **Linear — Recommended**
- GitHub Projects
- Jira / Atlassian
- ClickUp
- GitLab Issues / Boards
- Azure DevOps Boards
- Plane
- Asana
- monday.com
- Notion
- Other compatible provider
- **Skip Project Management**

Only providers with a real current connection path should be active selectable options. See `PROJECT-MANAGEMENT.md` and `config/integrations/project-management.json`.

After selection, the AI securely connects/maps an existing or new external project, verifies the mapping, and enables sync. GitHub/repository reality remains canonical for code, branches, PR/MR, merges, tests, and release evidence.

Linear remains the recommended default adapter, not a mandatory dependency. If selected, `config/integrations/linear-sync.json` stores Linear-specific child state.

### 3. Choose Development AI

Next present:

**Choose Development AI**

Candidate examples may include:

- Codex / ChatGPT
- Claude Code
- GitHub Copilot
- Gemini
- Cursor
- Windsurf
- Other verified compatible agent

Only agents the current host can actually invoke, attach, or hand work to should be selectable. One or more may be chosen when supported, then assigned to Supervisor/Worker roles. Selection state lives in `config/ai/agent-catalog.json`.

### 4. Apply Code Quality automatically

Child bootstrap installs the universal baseline from `blueprints/github/`, including repository-integrity validation, Dependency Review, CodeQL baseline, Scorecard, Dependabot, and other child runtime workflows defined by bootstrap.

After technology-stack approval, AI automatically selects mature stack-specific formatter/linter/type/static-analysis/test/build/dependency/security tooling appropriate to the actual project.

Do not claim a check is active/passing until child-repository evidence exists.

### 5. Ask about GitHub Rules

Once child CI provides stable check names, present:

- **Apply Recommended GitHub Rules**
- **Review GitHub Rules**

If an authenticated admin-capable AI can apply them and the user approves, apply the child policy from `config/github/ruleset-policy.json`, re-read GitHub, and verify enforcement.

If the AI cannot apply settings itself, provide exact manual settings and keep Rules setup pending until verified.

The canonical source is never the target of this child-project Rules step.

## Project intake and research flow

After initialization, collect one free-form input:

**Idea / Thoughts / Plan / Research / Search / Assumptions**

Then execute:

**Understand → Internet Discovery → Focused Research → Independent Reasoning → Market Comparison → Comparable-System Audit → Synthesis → Project Plan**

Assumptions must never silently become facts. See `START-HERE.md`.

## Engineering lifecycle

After planning:

1. System Design
2. Technology Recommendation + explicit `Approve Technology Stack`
3. Development Architecture
4. Data Flow Design
5. Professional UI/UX / optional Figma audit
6. Development + DevOps
7. SQA
8. Security Engineering / authorized defensive adversarial assessment
9. Review, release, observability, rollback, documentation, and project-memory synchronization

See `DEVELOPMENT-LIFECYCLE.md`.

## AI-native execution model

Project hierarchy:

**Project → Phase/Milestone → Module → Small Work Unit → Acceptance/Verification**

The repository persists project memory, options/modules banks, execution graph, decisions, traceability, and resumption state. See `AI-NATIVE-EXECUTION.md`.

## Multi-agent execution

Child projects support:

- dynamic user selection of available development AIs;
- multiple isolated Workers;
- exactly one authoritative Supervisor per coordination epoch;
- deterministic atomic Worker claims using GitHub refs;
- Worker/Supervisor leases and fencing tokens;
- PR/MR review and merge gates;
- merge-generation alerts and Worker reconciliation;
- selected PM-provider progress mirroring through a common adapter contract;
- deterministic repository-backed handoff/resume.

Worker completion handoff:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

See `AUTO-AGENT.md`, `SUPERVISOR.md`, `MULTI-AGENT-ORCHESTRATION.md`, and `ORCHESTRATOR.md`.

## Project-management adapter behavior

The selected PM provider mirrors planning/progress collaboration, not code truth.

Common adapter concepts include project/milestone/module/task creation, assignment, blockers, branch/PR links, review/merge state, progress, and verified completion.

After verified mapping, sync material plan/assignment/blocker/review/merge/completion changes. Hourly reconciliation is required only when a persistent runtime actually exists.

If no PM provider is selected, repository-backed planning continues. Provider switching is supported after repository-first reconciliation and verification of the replacement mapping.

See `PROJECT-MANAGEMENT.md`.

## GitHub Rules behavior in child projects

`config/github/ruleset-policy.json` is an inactive desired-policy blueprint in the source template. Rules are applied only to the child project after user approval and actual GitHub verification.

See `GITHUB-GOVERNANCE.md`.

## Code Quality behavior in child projects

`config/quality/quality-policy.json` describes child quality policy. Active workflow files are installed from `blueprints/github/` only into child projects. Stack-specific tooling is selected after stack approval.

See `CODE-QUALITY.md`.

## Continuous improvement in child projects

Child runtime blueprints support:

- 24-hour technology-update audits after post-stack execution begins;
- optional 25-hour innovation scouting after explicit owner opt-in;
- protocol-version/update checks against upstream ANPOS.

These workflows are inactive in the source and become operational only after child initialization installs them.

## Final-core distributed control plane

The runtime contract includes child bootstrap/reset, atomic Worker claims/leases, Supervisor election/failover/fencing, durable orchestrator contract, role-aware AI routing, formal state machines, protocol migrations, vendor adapters, requirement traceability, and path ownership/CODEOWNERS.

Core invariant:

> **GitHub refs arbitrate distributed ownership; JSON mirrors state; fencing tokens block stale leaders/workers; repository/Git/PR/test reality remains canonical.**

## Important source files

- `AGENTS.md` — universal router and source-vs-child boundary.
- `.ai/manifest.json` — role-aware instruction routing.
- `PROJECT-INITIALIZATION.md` — child bootstrap + PM selection + AI selection + Code Quality + GitHub Rules setup.
- `PROJECT-MANAGEMENT.md` — provider-agnostic PM adapter contract and switching rules.
- `config/integrations/project-management.json` — PM provider catalog/selection/sync blueprint.
- `config/ai/agent-catalog.json` — available/selected development AI pool.
- `START-HERE.md` — intake/research/planning flow.
- `DEVELOPMENT-LIFECYCLE.md` — engineering lifecycle.
- `AI-NATIVE-EXECUTION.md` — project memory/options/modules/execution graph.
- `MULTI-AGENT-ORCHESTRATION.md` — multi-agent coordination.
- `AUTO-AGENT.md` — Worker protocol.
- `SUPERVISOR.md` — Supervisor protocol.
- `ORCHESTRATOR.md` — durable external runtime contract.
- `CODE-QUALITY.md` — child quality strategy.
- `GITHUB-GOVERNANCE.md` — child GitHub Rules strategy.
- `CONTINUOUS-IMPROVEMENT.md` — update/innovation loops.
- `FINAL-CORE.md` — distributed runtime requirements.
- `blueprints/github/` — inactive GitHub workflow/Dependabot blueprints installed into child projects.

## Start prompt

For a **child project repository created from this template**, give its repository URL to a compatible AI and say:

> Read this repository's AI instructions and initialize the project.

The repository then defines the remaining interaction.
