# Child Project Initialization Flow

This repository is a **template/protocol source**, not a live application project. The template source must remain unbound to project-specific Linear state and must not treat GitHub Rules or application code-quality tooling as already applied to itself.

These steps run only after a new repository/project is created from this template.

## 0. Detect source template vs child project

Read `config/protocol/instance.json`.

- If `instance_status` is `template_source`, do **not** connect Linear, map a Linear project, apply GitHub Rules, or activate project code-quality/runtime workflows against the template source.
- If this is a child/new project, run `scripts/bootstrap_instance.py` and continue below.

## 1. Connect Linear

Immediately after child-project bootstrap, offer the primary action:

**Connect Linear**

Use the host's connected-app/OAuth/authentication flow when available. Never ask the user to paste a Linear password, API token, session cookie, or other raw secret into chat unless the platform provides a secure credential-specific mechanism explicitly intended for that secret.

After Linear is connected:

1. ask the user which Linear workspace/project should map to this repository when more than one valid choice exists;
2. attach an existing project when selected, or create a new Linear project when the user wants one and the connected interface permits it;
3. persist the resulting project name/ID/URL only in the child repository's `config/integrations/linear-sync.json`;
4. set Linear sync `enabled: true` only after the mapping is verified;
5. sync plan, phases/milestones, modules/work units, progress, ownership, blockers, review/merge state, Supervisor state, and material project changes;
6. reconcile on startup/resume and material events;
7. perform hourly reconciliation only when a persistent runtime actually exists.

GitHub/repository state remains canonical for code/branch/PR/merge reality. Linear is the planning/progress mirror.

## 2. Ask to apply recommended GitHub Rules

Once the child repository exists and baseline quality workflows are installed, present:

- Primary action: **Apply Recommended GitHub Rules**
- Secondary action: **Review GitHub Rules**

Do not silently apply repository administration settings before this project-start approval.

If the active AI has authenticated repository-admin capability and the user approves:

1. inspect current repository rules/settings;
2. apply the desired policy from `config/github/ruleset-policy.json`;
3. verify required status-check names against actual successful child-project workflows;
4. re-read GitHub settings/rulesets;
5. mark Rules setup complete only after verification.

If the AI cannot apply the settings itself:

1. tell the user that admin write capability is unavailable;
2. provide the exact repository settings/rules that must be enabled;
3. keep Rules setup marked `pending_user_action`;
4. re-check and verify after the user applies them.

The template source repository is not the target of this project-start Rules flow.

## 3. Apply Code Quality to the child repository

Code Quality is a child-project setup responsibility, not a live configuration of the template source.

During child bootstrap, install the universal baseline blueprints from `blueprints/github/` into the child's active `.github/` paths, including the repository integrity workflow, Dependency Review, CodeQL baseline, Scorecard, and Dependabot where supported.

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

After installation, run/verify the gates and record the actual check names before using them in GitHub Rules.

## 4. Continue project planning/development

After the child repository is initialized, Linear connection/mapping has been attempted, baseline Code Quality is installed, and the GitHub Rules decision is recorded, continue the normal ANPOS research → planning → architecture → development lifecycle.

## Core boundary

**Template source = instructions + reusable blueprints. Child project = connected integrations + applied rules + active quality/runtime automation + project-specific state.**
