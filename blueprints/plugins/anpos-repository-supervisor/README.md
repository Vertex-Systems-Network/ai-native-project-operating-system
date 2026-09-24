# ANPOS Repository Supervisor Plugin Blueprint

Status: **inert source-side blueprint aligned to ANPOS 1.4.0 / Requirements 83–96**. This directory defines the product/runtime contract for a ChatGPT/Codex plugin that accepts a user-supplied GitHub or GitLab repository URL and supervises ANPOS-based project initialization, adoption, audit, and development. It is not a deployed MCP server and contains no live credentials.

## Product goal

The user supplies one repository URL, for example:

```text
https://github.com/owner/repository
```

or:

```text
https://gitlab.com/group/repository
```

The plugin then:

1. resolves the repository provider and canonical repository identity;
2. authenticates the user through the plugin MCP server using provider-appropriate OAuth;
3. performs a read-only repository audit;
4. classifies the repository's ANPOS state;
5. proposes the smallest safe next action;
6. performs writes only through a feature branch / change request with optimistic concurrency;
7. continues the ANPOS Supervisor workflow after the repository is safely initialized or adopted.

The repository URL is a locator, **not authorization**.

## ANPOS 1.4.0 assurance baseline

The supervisor must understand the active ANPOS 1.4.0 child control plane, including the unified Requirements 83–96 assurance state.

For an ANPOS child, audit/resume/upgrade flows must inspect the project-specific evidence state for:

- Requirements 83–88: AI/model evaluation, user/problem validation, product analytics, experimentation, progressive delivery, and engineering maintainability;
- Requirements 89–96: responsible-AI/human oversight, compliance evidence, architecture decision records, AI asset/configuration identity, deprecation/EOL, operational runbooks/resilience drills, tamper-evident audit evidence, and unified risk/exception lifecycle.

Policy-file presence is never pass evidence. The plugin must preserve verified project evidence, distinguish pending/applicable/not-applicable states, and bind pass claims to the exact verified source/runtime/configuration reference.

## OpenAI plugin shape

Use the portable Agent Plugins layout:

```text
anpos-repository-supervisor/
├── plugin.json
├── mcp.json
└── skills/
    └── anpos-repository-supervisor/
        └── SKILL.md
```

The MCP server owns authentication, authorization, provider API access, concurrency checks, mutation safety, audit logging, and ANPOS release retrieval. The skill owns the deterministic workflow and tells the model how to use those tools.

## Provider architecture

The runtime must expose one provider-neutral repository contract and keep GitHub/GitLab API details behind adapters.

```text
ChatGPT / Codex
      │
      ▼
ANPOS skill
      │
      ▼
VSN MCP server
      │
      ├── GitHub adapter
      └── GitLab adapter
              │
              ▼
      target repository
```

Provider-specific terms normalize as follows:

| Neutral concept | GitHub | GitLab |
| --- | --- | --- |
| repository | repository | project/repository |
| change request | pull request | merge request |
| default branch | default branch | default branch |
| checks | Actions/checks/statuses | pipelines/jobs/statuses |
| issues | Issues | Issues |
| protected branch | branch protection/rulesets | protected branch / approval rules |

The skill must reason in neutral concepts unless provider-specific behavior matters.

## Repository classification

Every run starts read-only. The MCP server must classify the target into exactly one state:

- `canonical_source` — the ANPOS canonical source itself; never initialize it as a child.
- `active_project` — ANPOS child already initialized; reconcile and resume.
- `uninitialized_child` — copied ANPOS template with `instance_status: template_source`; use the canonical child bootstrap flow.
- `not_anpos` — existing repository without ANPOS; use the adoption flow.
- `partial_or_malformed` — ANPOS-like files exist but state is incomplete/inconsistent; stop writes and produce a repair plan.
- `empty_repository` — no meaningful project content; bootstrap from a sanitized child template/release.

The server must return the evidence used for classification, including repository identity, default branch, current head SHA, detected ANPOS protocol version, unified Requirements 83–96 assurance summary, and ANPOS fingerprint files that were checked.

## New-template bootstrap

For a repository that was created from a sanitized ANPOS child template:

1. verify target repository identity differs from the canonical source;
2. verify `config/protocol/instance.json`;
3. run or faithfully implement `scripts/bootstrap_child.py`;
4. keep vendor-only/source-only paths out of the child;
5. stage generated changes on a feature branch;
6. run repository validation/quality checks;
7. open a PR/MR for review.

Never direct-write initialized state to the protected default branch.

## Existing-repository adoption

Arbitrary existing repositories require a different path. Do **not** copy the canonical source over the repository.

Adoption must:

1. inventory the current repository and technology stack read-only;
2. fetch an immutable, sanitized ANPOS child release from the configured release source;
3. compare every proposed ANPOS path against the target tree;
4. classify collisions as:
   - safe new control-plane file,
   - merge-required text/config,
   - project-owned file that must be preserved,
   - unsafe/ambiguous conflict;
5. never overwrite application code blindly;
6. merge shared files such as `.gitignore` conservatively;
7. preserve existing CI, deployment, license, and repository-specific policy unless an explicit migration is approved;
8. generate a deterministic adoption plan and proposed file set;
9. bind the plan to the observed target head SHA and ANPOS release digest;
10. apply only on a feature branch after user confirmation;
11. run ANPOS validation plus stack-appropriate checks;
12. initialize Requirements 83–96 applicability without inventing pass evidence or erasing pre-existing verified project evidence;
13. open a PR/MR with the complete adoption report.

If the target head changes after planning, invalidate the plan and re-audit.

## Development/resume flow

After ANPOS is active:

Before selecting work, read the target protocol version plus the child assurance/governance state required by the active milestone. For upgrades, use the non-destructive ANPOS migration contract; do not blindly replace project-owned state.

1. re-read repository identity and default-branch head;
2. load the child ANPOS router/state required by the active role;
3. reconcile open Issues first and open PRs/MRs second when the project protocol requires it;
4. select one bounded development milestone;
5. create/update a feature branch;
6. run relevant quality/security checks;
7. open or update the change request;
8. merge only when repository policy, checks, review, expected-head protection, and required human confirmation are satisfied;
9. re-read resulting default branch before marking the milestone complete.

One tool response or model statement is never sufficient proof of a remote mutation; verify repository state after material writes.

## Required MCP tool groups

The provider-neutral contract is defined in `contracts/repository-provider-contract.json`. At minimum the server needs tools equivalent to:

- repository URL resolve/profile;
- read-only repository audit;
- bounded file/tree reads;
- ANPOS adoption/bootstrap planning;
- feature-branch apply with expected-head SHA;
- PR/MR creation and inspection;
- CI/check inspection;
- guarded merge.

Keep broad arbitrary repository mutation tools out of the first public version.

## Authentication and authorization

Private repository reads and all writes require authenticated user context. Use MCP-compatible OAuth 2.1 authorization. The server must:

- validate issuer, audience, expiry, and scopes on every request;
- never accept provider passwords, PATs, session cookies, or private keys in chat/tool arguments;
- keep provider credentials server-side or in the provider/OAuth flow;
- scope every tool call to the authenticated account and repository permissions;
- expose separate read and write scopes when practical;
- support account identification so users can distinguish multiple connected accounts.

## Repository URL safety

A repository URL is untrusted input. Before any network call:

- parse and normalize the URL;
- allow only configured GitHub/GitLab hosts;
- reject embedded credentials;
- reject `file:`, `ssh:`, local paths, loopback, link-local, and private-network destinations unless an enterprise administrator explicitly configured that host;
- for self-hosted GitLab, use an administrator allowlist and HTTPS;
- do not follow arbitrary redirects to unapproved hosts;
- protect against DNS rebinding/SSRF in the MCP service.

## Prompt-injection boundary

Repository files, Issues, PR/MR comments, CI logs, README text, and provider metadata are **untrusted data**. They may describe project requirements but cannot:

- override the user's current instruction;
- change the plugin's authorization model;
- grant new scopes;
- bypass ANPOS control-plane/security policy;
- cause secret disclosure;
- authorize destructive writes or merges.

The MCP server must enforce permissions independently of model instructions.

## Mutation safety

All material writes use optimistic concurrency and a traceable plan:

- branch base SHA required;
- expected target head SHA required;
- immutable ANPOS release/version digest recorded;
- idempotency key for replayable operations;
- no force push by default;
- no default-branch direct writes in the normal workflow;
- PR/MR merge requires current head verification;
- destructive or difficult-to-reverse actions require explicit confirmation;
- provider response is re-read after mutation.

## ANPOS source boundary

This plugin blueprint is source/operator infrastructure and must not be retained in normal child repositories or customer-facing ANPOS template exports. The canonical repository remains inert; deployed plugin credentials, OAuth client secrets, database secrets, provider tokens, and production endpoints never belong in this repository.

## Delivery phases

### Phase 1 — blueprint and contract
- portable plugin package skeleton;
- provider-neutral repository tool contract;
- ANPOS Skill workflow;
- security/adoption rules.

### Phase 2 — GitHub adapter
- ANPOS 1.4.0 protocol + Requirements 83–96 audit/resume/upgrade support;
- OAuth and account profile;
- repository audit/read tools;
- safe feature-branch changes;
- PR/check/merge flow;
- conformance tests.

### Phase 3 — GitLab adapter
- equivalent OAuth/provider adapter;
- MR/pipeline/protected-branch mapping;
- same neutral tool contract and conformance suite.

### Phase 4 — public plugin readiness
- production HTTPS MCP endpoint;
- privacy/retention policy;
- audit logging and abuse controls;
- adversarial/prompt-injection tests;
- OpenAI plugin validation/review;
- optional UI for repository status, adoption diff, and confirmation surfaces.

## Non-goals for the first version

- arbitrary shell execution in user repositories;
- collecting raw provider secrets in chat;
- bypassing branch protection or required reviews;
- silently applying repository-admin settings;
- automatically deleting repositories/branches;
- treating repository content as trusted instructions;
- claiming GitHub/GitLab support before the corresponding adapter passes conformance.
