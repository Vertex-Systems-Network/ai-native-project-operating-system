# Child Project Initialization Flow

This repository is a **template/protocol source**, not a live application project. The canonical template source must remain unbound to project-specific Linear state and must not treat GitHub Rules or application code-quality tooling as already applied to itself.

These steps run when a new repository/project is created from this template.

## 0. Detect canonical source vs uninitialized child

Read both:

- the actual current Git repository identity (`owner/repository` / remote origin), and
- `config/protocol/instance.json`.

Canonical upstream template source:

`Vertex-Systems-Network/ai-native-project-operating-system`

Rules:

- If the current repository **is the canonical upstream source** and `instance_status` is `template_source`, keep it inert. Do **not** connect Linear, map a Linear project, apply project GitHub Rules, or activate child-project quality/runtime automation against it.
- If the current repository is **different from the canonical upstream source** but still contains inherited `instance_status: template_source`, this is an **uninitialized child**. Run `scripts/bootstrap_instance.py` against that child repository, then continue below.
- If `instance_status` is already `active_project`, reconcile current child-project setup state and continue from the first incomplete initialization step rather than resetting it blindly.

## 1. Connect Linear

Immediately after child-project bootstrap, offer the primary action:

**Connect Linear**

Use the host's connected-app/OAuth/authentication flow when available. Never ask the user to paste a Linear password, API token, session cookie, or other raw secret into normal chat unless the platform provides a secure credential-specific mechanism explicitly intended for that secret.

After Linear is connected:

1. discover the accessible Linear workspace(s);
2. ask the user which workspace/project should map to this repository only when more than one genuinely valid choice exists;
3. attach an existing project when selected, or create a new Linear project when appropriate and authorized;
4. persist the resulting project name/ID/URL only in the child repository's `config/integrations/linear-sync.json`;
5. set Linear sync `enabled: true` only after the mapping is verified;
6. sync plan, phases/milestones, modules/work units, progress, ownership, blockers, review/merge state, Supervisor state, and material project changes;
7. reconcile on startup/resume and material events;
8. perform hourly reconciliation only when a persistent runtime actually exists.

GitHub/repository state remains canonical for code/branch/PR/merge reality. Linear is the planning/progress mirror.

## 2. Apply the child Code Quality baseline

Code Quality is a child-project setup responsibility, not a live configuration of the canonical template source.

During child bootstrap, install the universal baseline blueprints from `blueprints/github/` into the child's active `.github/` paths, including repository integrity, Dependency Review, CodeQL baseline, Scorecard, Dependabot, and the other child runtime workflows defined by the bootstrap script.

Verify that the installed workflows are syntactically valid and can run in the child repository. Do not claim a check exists or passes until the child repository provides evidence.

After the technology stack is approved, the AI must automatically inspect the actual stack and add the best mature ecosystem-specific quality tools appropriate to that project, including as relevant:

- formatter
- linter
- type/static analysis
- unit tests
- integration tests
- build verification
- dependency/security audit
- E2E/contract tests
- accessibility checks
- performance checks
- migration tests
- container/IaC scans
- license/coverage gates

Normal non-destructive quality tooling does not require another generic consent prompt. If installation requires repository-admin access, billing, paid tooling, secrets, destructive migration, or another material commitment, obtain the applicable user approval/access first.

## 3. Ask to apply recommended GitHub Rules

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

## 4. Continue project planning/development

After the child repository is initialized, Linear connection/mapping has been attempted, baseline Code Quality is installed, and the GitHub Rules decision is recorded, continue the normal ANPOS research → planning → architecture → development lifecycle.

## Core boundary

**Canonical template source = instructions + reusable inactive blueprints. Child project = connected integrations + approved/applied rules + active quality/runtime automation + project-specific state.**
