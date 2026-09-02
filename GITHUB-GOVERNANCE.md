# GitHub Governance and Repository Rules

This repository treats GitHub governance as part of the AI-native control plane, not as an optional administrator preference.

The desired machine-readable policy is `config/github/ruleset-policy.json`.

## AI responsibility

Whenever an AI/Supervisor has an authenticated GitHub administration capability that can create or update repository rulesets/settings, it should:

1. read the desired policy;
2. inspect current repository rulesets and merge settings;
3. calculate a minimal safe change plan;
4. apply the policy when the user has already authorized repository administration through this template;
5. verify the resulting GitHub state after the write;
6. record any unsupported or unavailable controls instead of pretending they were applied.

If the available connector is read-only for rulesets/settings, the AI must not claim enforcement. It should keep the desired policy in-repo and surface governance drift.

## Default-branch policy

For `main`, the intended baseline is:

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

After the first successful CI runs, verify the exact status-check context names before marking them required in GitHub.

## Merge policy

For multi-agent work, prefer squash merging into `main`. This keeps each bounded Worker/Supervisor PR as one auditable integration event and simplifies merge-generation synchronization.

Desired repository settings:

- squash merge: enabled;
- merge commits: disabled;
- rebase merge: disabled;
- auto-merge: enabled;
- update branch: enabled;
- merge queue: recommended when available and practical for the repository plan.

Merge queue is especially useful once multiple Workers frequently submit concurrently, but it should not be required when the GitHub plan or repository mode does not support it.

## Required checks baseline

The universal template checks are:

- `AI Native Quality Gates / repository-integrity`
- `Dependency Review / dependency-review`
- `CodeQL / analyze-actions`

Stack-specific checks are added after technology approval and should become required once their stable check names have been observed.

## Drift monitoring

`.github/workflows/governance-audit.yml` periodically checks whether a ruleset exists and whether important repository merge settings match the desired policy. It can report drift, but `GITHUB_TOKEN` is not treated as an administration credential for silently changing repository governance.

Governance changes must be performed through an authenticated administration-capable GitHub interface/API and verified afterward.
