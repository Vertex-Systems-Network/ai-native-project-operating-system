# Child Project Initialization Flow

This repository is a **template/protocol source**, not a live application project. The canonical template source must remain unbound to project-specific project-management state and must not treat GitHub Rules, development AIs, or application code-quality tooling as already attached/applied to itself.

These steps run when a new repository/project is created from this template.

## 0. Detect canonical source vs uninitialized child

Read both:

- the actual current Git repository identity (`owner/repository` / remote origin), and
- `config/protocol/instance.json`.

Canonical upstream template source:

`Vertex-Systems-Network/ai-native-project-operating-system`

Rules:

- If the current repository **is the canonical upstream source** and `instance_status` is `template_source`, keep it inert. Do **not** connect a project-management provider, attach a live project, apply child GitHub Rules, attach development agents, or activate child-project quality/runtime automation against it.
- If the current repository is **different from the canonical upstream source** but still contains inherited `instance_status: template_source`, this is an **uninitialized child**. Run `scripts/bootstrap_instance.py` against that child repository, then continue below.
- If `instance_status` is already `active_project`, reconcile current child-project setup state and continue from the first incomplete initialization step rather than resetting it blindly.

## 1. Bootstrap the child project

Run `scripts/bootstrap_instance.py` or equivalent safe repository writes.

The bootstrap creates child identity, clears inherited runtime state, regenerates child CODEOWNERS, installs the baseline child quality/runtime blueprints, and leaves project-management provider selection, development-AI selection, and GitHub Rules decisions unresolved for the setup flow below.

## 2. Choose Project Management System

Load `PROJECT-MANAGEMENT.md` and `config/integrations/project-management.json`.

Discover which project-management systems the current AI environment can actually connect to, invoke, or securely guide the user to attach.

Preferred selection surface:

**Choose Project Management System**

Candidate choices may include:

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

Only expose an option as actively selectable/attachable when a real connection path exists in the current environment. Unavailable providers may be shown separately as recommendations, never as controls that falsely imply integration exists.

If the user selects **Skip Project Management**, keep repository-backed planning canonical and continue. PM integration can be connected later without blocking development.

## 3. Connect and map the selected PM provider

When a provider is selected:

1. use the host's secure connector/OAuth/MCP/authenticated integration flow;
2. never ask the user to paste an ordinary password, session cookie, or raw private token into normal chat;
3. discover accessible workspace/organization/project choices;
4. ask the user to choose only when multiple genuinely valid targets exist;
5. attach an existing project or create one when appropriate and authorized;
6. persist the selected provider and verified external workspace/project mapping only in the child repository's `config/integrations/project-management.json` and provider-specific adapter state when needed;
7. enable sync only after the mapping is verified;
8. synchronize phases/milestones, modules/work units, progress, ownership, blockers, review/merge state, and material delivery changes according to `PROJECT-MANAGEMENT.md`.

GitHub/repository state remains canonical for code/branch/PR/merge/test reality. The PM provider is the planning/progress collaboration mirror.

If Linear is selected, use `config/integrations/linear-sync.json` as the Linear-specific adapter state. Linear is recommended, not mandatory.

## 4. Choose Development AI

Project-management selection and development-AI selection are independent.

Discover which development agents/tools the current host can actually invoke, attach, hand off to, or otherwise use for this repository.

Preferred selection surface:

**Choose Development AI**

Candidate examples may include:

- Codex / ChatGPT
- Claude Code
- GitHub Copilot
- Gemini
- Cursor
- Windsurf
- Other verified compatible agent

Only make actually usable agents selectable. Unavailable agents may be listed separately as suggestions.

Allow one or more agents when the host supports a multi-agent pool. Record availability and user selection in `config/ai/agent-catalog.json`.

When useful, allow role assignment such as:

- Supervisor: one selected capable agent
- Workers: one or more selected capable agents

Do not claim an AI is attached or runnable merely because it is a known product.

## 5. Apply and verify the child Code Quality baseline

Code Quality is a child-project setup responsibility, not a live configuration of the canonical template source.

During child bootstrap, install the universal baseline blueprints from `blueprints/github/` into the child's active `.github/` paths, including repository integrity, Dependency Review, CodeQL baseline, Scorecard, Dependabot, and the other child runtime workflows defined by the bootstrap script.

Verify that installed workflows are syntactically valid and can run in the child repository. Do not claim a check exists or passes until child-repository evidence exists.

After the technology stack is approved, automatically inspect the actual stack and add mature ecosystem-specific formatter, linter, type/static analysis, unit/integration/build/dependency/security tooling and relevant E2E/contract/accessibility/performance/migration/container/IaC/license/coverage gates.

Normal non-destructive quality tooling does not require another generic consent prompt. If installation requires repository-admin access, billing, paid tooling, secrets, destructive migration, or another material commitment, obtain the applicable approval/access first.

## 6. Ask to apply recommended GitHub Rules

Once the child repository exists and its baseline quality workflows are installed enough to determine real check names, present:

- Primary action: **Apply Recommended GitHub Rules**
- Secondary action: **Review GitHub Rules**

Do not silently apply repository administration settings before this project-start approval.

If the active AI has authenticated repository-admin capability and the user approves:

1. inspect current child repository rules/settings;
2. apply the desired policy from `config/github/ruleset-policy.json`;
3. verify required status-check names against actual successful child-project workflows;
4. re-read GitHub settings/rulesets;
5. install/enable `blueprints/github/workflows/governance-audit.yml` in the child when appropriate;
6. mark Rules setup complete only after verification.

If the AI cannot apply the settings itself:

1. tell the user that admin write capability is unavailable;
2. provide the exact repository settings/rules that must be enabled;
3. keep Rules setup marked `pending_user_action`;
4. re-check and verify after the user applies them.

The canonical template source repository is never the target of this child-project Rules flow.

## 7. Continue project intake, planning, and development

After the child repository is initialized, the PM provider decision/mapping is recorded, the development-AI pool decision is recorded, baseline Code Quality is installed, and the GitHub Rules decision is recorded, continue the normal ANPOS research → planning → architecture → development lifecycle.

PM connection and GitHub Rules may remain explicitly pending when external access is unavailable; do not invent completion. The repository remains sufficient to continue safely where the missing integration is non-blocking.

## Core boundary

**Canonical template source = instructions + reusable inactive blueprints. Child project = selected/connected integrations + selected development AI pool + approved/applied rules + active quality/runtime automation + project-specific state.**
