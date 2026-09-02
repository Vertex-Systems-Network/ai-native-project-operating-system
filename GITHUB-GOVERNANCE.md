# GitHub Governance and Repository Rules

GitHub governance is part of the **child-project initialization and control plane**. The canonical template source stores a reusable desired policy; it is not evidence that the source repository itself has those project rules applied.

The desired machine-readable blueprint is `config/github/ruleset-policy.json`.

## Source template boundary

For `Vertex-Systems-Network/ai-native-project-operating-system`:

- `config/github/ruleset-policy.json` is an inactive reusable blueprint;
- do not report a missing child-project ruleset on the canonical source as governance drift for a real project;
- do not silently apply child-project merge/ruleset settings to the canonical source;
- `blueprints/github/workflows/governance-audit.yml` remains inactive until a child project reaches the Rules setup stage.

## Child-project setup flow

After child bootstrap and after baseline quality workflows have produced/established their actual check names, present:

- **Apply Recommended GitHub Rules**
- **Review GitHub Rules**

The AI must not silently perform repository-administration writes before the project-start Rules decision.

If the user approves and an authenticated admin-capable GitHub interface is available, the AI should:

1. read the desired policy;
2. inspect current child repository rulesets and merge settings;
3. calculate a minimal safe change plan;
4. verify real child-project status-check names;
5. apply the approved policy;
6. re-read GitHub rules/settings after the write;
7. install/enable the governance-audit workflow in that child project when appropriate;
8. mark setup complete only after verification.

If the available interface cannot create/update rulesets/settings, the AI must not claim enforcement. It should:

1. tell the user that admin write capability is unavailable;
2. show the exact required settings;
3. keep Rules setup as `pending_user_action`;
4. re-check after the user applies them.

## Recommended default-branch policy

For a child project's `main`, the intended baseline is:

- pull request required before merge;
- at least one approval;
- stale approvals dismissed after new pushes;
- most recent reviewable push approved by someone other than its author where supported;
- review conversations resolved;
- required quality/status checks passing;
- branch up to date before merge;
- force pushes blocked;
- branch deletion blocked/restricted;
- linear history;
- Supervisor self-authored high-risk/security-critical changes independently reviewed.

After successful child-project CI runs, verify the exact status-check context names before marking them required in GitHub.

## Merge policy

For multi-agent child-project work, prefer squash merging into `main`. This keeps each bounded Worker/Supervisor PR as one auditable integration event and simplifies merge-generation synchronization.

Recommended settings:

- squash merge: enabled;
- merge commits: disabled;
- rebase merge: disabled;
- auto-merge: enabled;
- update branch: enabled;
- merge queue: recommended when available and practical.

Merge queue is especially useful once multiple Workers frequently submit concurrently, but it should not be required when the GitHub plan or repository mode does not support it.

## Required checks baseline

Candidate universal child-project checks are:

- `AI Native Quality Gates / repository-integrity`
- `Dependency Review / dependency-review`
- `CodeQL / analyze-actions`

These are desired names from the supplied workflow blueprints, not proof that a specific child repository has produced them. Confirm the actual check contexts in that child before enforcing them.

Stack-specific checks are added after technology approval and should become required once their stable check names have been observed.

## Drift monitoring

`blueprints/github/workflows/governance-audit.yml` is the reusable child-project audit blueprint. It is installed/enabled only after the child Rules setup stage. It can report drift, but `GITHUB_TOKEN` is not treated as an administration credential for silently changing repository governance.

Governance changes must be performed through an authenticated administration-capable GitHub interface/API and verified afterward.
