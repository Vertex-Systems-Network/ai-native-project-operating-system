# AI Native Project Operating System

A reusable Git repository template/protocol for starting new AI-native software projects with structured research, planning, architecture, multi-agent development, quality, security, governance, project memory, and continuous improvement.

## Important: this repository is the template source

`Vertex-Systems-Network/ai-native-project-operating-system` is **not a live application project**.

The canonical source must stay neutral and reusable:

- **Linear:** not connected or mapped to a real project by design.
- **GitHub Rules:** child-project desired policy is stored, but project rules are not applied to this source by the ANPOS initialization flow.
- **Code Quality / runtime workflows:** stored as inactive blueprints under `blueprints/github/`; they are not active child-project automation on the canonical source.
- **Supervisor / Workers:** no application-project Supervisor or Worker execution is implied on the source template.
- **Project progress:** the source template does not maintain a fake project-completion dashboard.

Core boundary:

> **Canonical template source = instructions + reusable inactive blueprints. Child project = connected integrations + approved/applied rules + active quality/runtime automation + project-specific state.**

## How a new project uses this template

1. Create/copy a **new child Git repository** from this template.
2. Give the **child repository URL** to the AI.
3. The AI reads `AGENTS.md`, `.ai/manifest.json`, `PROJECT-INITIALIZATION.md`, and the actual repository identity.
4. If the child inherited `instance_status: template_source`, the AI runs the child bootstrap rather than treating it as the canonical source.
5. Offer **Start Development**.
6. Initialize the child project using the flow below.

## Mandatory child-project initialization

### 1. Bootstrap the child instance

`scripts/bootstrap_instance.py` resets inherited runtime state, creates the child project identity, regenerates child CODEOWNERS, and installs the normal child runtime/quality workflow blueprints into active `.github/` paths.

The script refuses to bootstrap the canonical source by default.

### 2. Connect Linear

The AI must offer:

**Connect Linear**

Use the host's secure connected-app/OAuth flow. Do not ask the user to paste a normal Linear password, raw API token, session cookie, or other secret into chat.

After authentication, the AI maps or creates the correct Linear project, persists that mapping **only in the child repository**, enables sync after verification, and mirrors planning/progress state automatically. GitHub remains canonical for code/branch/PR/merge reality.

### 3. Apply Code Quality automatically

The child bootstrap installs the universal baseline from `blueprints/github/`, including the repository integrity baseline, Dependency Review, CodeQL baseline, Scorecard, Dependabot, and other child runtime workflows defined by the bootstrap process.

After the user approves the technology stack, the AI automatically selects and adds mature stack-specific formatter/linter/type/static-analysis/test/build/dependency/security tooling appropriate to the actual project.

Do not claim a check is active or passing until the child repository provides evidence.

### 4. Ask about GitHub Rules

Once the child repository has enough real CI evidence to know its check names, present:

- **Apply Recommended GitHub Rules**
- **Review GitHub Rules**

If the AI has authenticated repository-admin capability and the user approves, it applies the child policy from `config/github/ruleset-policy.json`, re-reads GitHub, and verifies enforcement.

If the AI cannot apply the settings itself, it gives the user the exact manual settings and keeps Rules setup pending until verification.

The canonical template source is never the target of this child-project Rules step.

## Project intake and research flow

After/alongside initialization, collect one free-form input:

**Idea / Thoughts / Plan / Research / Search / Assumptions**

Then execute:

**Understand → Internet Discovery → Focused Research → Independent Reasoning → Market Comparison → Comparable-System Audit → Synthesis → Project Plan**

The AI must distinguish facts, requirements, assumptions, preferences, constraints, questions, risks, and evidence. Assumptions must never silently become facts.

See `START-HERE.md`.

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

The project hierarchy is:

**Project → Phase/Milestone → Module → Small Work Unit → Acceptance/Verification**

The repository persists project memory, options/modules banks, execution graph, decisions, traceability, and resumption state.

See `AI-NATIVE-EXECUTION.md`.

## Multi-agent execution

Child projects support:

- dynamic selection of available development AIs;
- multiple isolated Workers;
- exactly one authoritative Supervisor per coordination epoch;
- deterministic atomic Worker claims using GitHub refs;
- Worker/Supervisor leases and fencing tokens;
- PR/MR review and merge gates;
- merge-generation alerts and Worker reconciliation;
- deterministic repository-backed handoff/resume.

Worker completion handoff remains:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

See `AUTO-AGENT.md`, `SUPERVISOR.md`, `MULTI-AGENT-ORCHESTRATION.md`, and `ORCHESTRATOR.md`.

## Linear behavior in child projects

Linear is a planning/progress mirror, not the code source of truth.

After verified child mapping, sync on material events such as planning changes, assignment, blockers, review state, merges, module/phase completion, governance/quality changes, and protocol/orchestration changes. Hourly reconciliation is required only when a persistent runtime actually exists.

The canonical source's `config/integrations/linear-sync.json` is intentionally an **unconnected blueprint**.

## GitHub Rules behavior in child projects

`config/github/ruleset-policy.json` is an inactive desired-policy blueprint in the source template.

Rules are applied only to the child project after the user is asked. Desired controls include PR-only integration, independent review, required verified checks, conversation resolution, up-to-date branch policy, force-push/deletion protection, linear history, and squash-oriented merge behavior where supported.

See `GITHUB-GOVERNANCE.md`.

## Code Quality behavior in child projects

`config/quality/quality-policy.json` describes the child quality policy. Active workflow files are installed from `blueprints/github/` only into child projects.

Stack-specific tooling is selected after stack approval based on the actual ecosystem and project needs.

See `CODE-QUALITY.md`.

## Continuous improvement in child projects

Child runtime blueprints support:

- 24-hour technology-update audits after the project reaches a post-stack lifecycle stage;
- optional 25-hour innovation scouting after explicit owner opt-in;
- protocol-version/update checks against upstream ANPOS.

These workflows live as inactive source blueprints and become operational only after child initialization installs them.

See `CONTINUOUS-IMPROVEMENT.md`.

## Final-core distributed control plane

The final-core runtime contract includes:

- child instance bootstrap/reset;
- atomic Worker claims + leases;
- Supervisor election + failover + fencing;
- durable orchestrator contract;
- role-aware AI manifest/router;
- formal schemas/state machines;
- protocol versioning/migration channel;
- thin vendor adapters;
- requirement-to-release traceability;
- path ownership/CODEOWNERS.

Core invariant:

> **GitHub refs arbitrate distributed ownership; JSON mirrors state; fencing tokens block stale leaders/workers; repository/Git/PR/test reality remains canonical.**

See `FINAL-CORE.md`.

## Important source files

- `AGENTS.md` — universal router and source-vs-child boundary.
- `.ai/manifest.json` — role-aware instruction routing.
- `PROJECT-INITIALIZATION.md` — child bootstrap + Linear + Code Quality + GitHub Rules setup.
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
