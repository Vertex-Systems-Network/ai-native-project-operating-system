# Project Management Provider Adapter Protocol

ANPOS is **project-management-provider agnostic**. The canonical template source does not connect to a live project-management account. Each child project selects and connects a provider during initialization.

Git/repository reality remains canonical for code, branches, commits, pull/merge requests, merges, tests, coordination claims, and release evidence. The selected project-management provider is the planning/progress collaboration mirror.

## Child-project selection flow

After child bootstrap, discover project-management providers that the current AI host can actually connect to, invoke, or guide the user to attach securely.

Preferred selection surface:

**Choose Project Management System**

Candidate providers include:

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

Only present a provider as an active selectable/attachable action when the current environment has a real connection path such as an installed connector, MCP server, authenticated API integration, Git-native integration, or an explicit secure setup path. Providers that are not currently usable may be shown separately as recommendations, but never as buttons that imply an integration already exists.

## Connection and authentication

After the user selects a provider:

1. use the host's secure connector/OAuth/MCP/authentication flow when available;
2. never ask the user to paste ordinary passwords, session cookies, private tokens, or raw credentials into normal chat;
3. discover accessible workspaces/organizations/projects;
4. ask the user to choose only when multiple genuinely valid targets exist;
5. attach an existing project or create one when the user wants that and the connected interface permits it;
6. persist provider + external project/workspace identifiers only in the child repository;
7. verify the mapping before marking it connected;
8. enable synchronization only after verification.

If no provider is selected, repository-backed planning continues normally. Project management is useful but not a dependency for ANPOS correctness.

## Common ANPOS adapter contract

Provider-specific APIs/MCP tools are translated into this conceptual interface:

- `create_project()`
- `update_project()`
- `create_phase_or_milestone()`
- `create_module()`
- `create_task()`
- `update_task()`
- `assign_agent()`
- `set_status()`
- `set_priority()`
- `set_blocker()`
- `clear_blocker()`
- `link_branch()`
- `link_pull_or_merge_request()`
- `sync_review_state()`
- `sync_merge_state()`
- `sync_progress()`
- `complete_task()`
- `archive_or_deprecate_task()`

A provider adapter may implement these concepts differently, but ANPOS orchestration must not become dependent on vendor-specific issue semantics.

## Canonical mapping

The normal mapping is:

**Project → Phase/Milestone → Module → Work Unit → Agent → Git Branch → PR/MR → Review → Merge → Verified Complete**

Example conceptual record:

- Work Unit: `AUTH-012 Google Login`
- Agent: `Worker-02`
- Branch: `agent/AUTH-012/google-login`
- Review: `PR #42`
- Git state: merged + required checks passed
- PM state: Done

A provider must never mark a work unit verified complete when Git/repository evidence says otherwise.

## Synchronization policy

After verified mapping, synchronize material project state:

- approved plan changes
- phase/milestone creation or completion
- module/work-unit creation
- assignment/ownership changes
- priority changes
- blockers
- review submission
- requested changes
- merges
- verified completion
- Supervisor state when useful
- release state
- governance/quality changes that materially affect delivery

Reconcile at startup/resume and material events. Hourly reconciliation is required only when a persistent runtime actually exists.

If the provider is unavailable, do not block development. Record degraded sync state and catch up when connectivity returns.

## Provider switching

The selected PM provider is not a permanent lock-in.

When the owner requests a switch:

1. reconcile GitHub/repository reality first;
2. read the current provider mapping;
3. connect and verify the replacement provider;
4. recreate/migrate active phases, modules, work units, assignments, blockers, and review references from canonical repository state;
5. store old-provider IDs in migration/history mapping where needed;
6. verify counts/state on the new provider;
7. only then disable the old active sync.

Never let a provider-to-provider migration rewrite Git history or override repository truth.

## Development AI selection

Project-management selection and development-AI selection are separate decisions.

After PM setup, discover development AI agents/tools actually available or attachable in the current host and present **Choose Development AI** actions. Candidate examples include Codex/ChatGPT, Claude Code, GitHub Copilot, Gemini, Cursor, Windsurf, and other compatible agents.

Allow one or more selected agents where the host can truly invoke/attach them. Record available, selected, and unavailable/suggested agents in `config/ai/agent-catalog.json`.

The selected AI pool can then be assigned by role, for example:

- Supervisor: Codex
- Workers: Claude Code + Codex + Gemini

or another verified combination.

Do not show an AI as attached merely because it is known by name.

## Source-template boundary

The canonical ANPOS source stores only provider catalogs, adapter contracts, and unconnected blueprint state. It must not contain a real selected PM provider, workspace ID, project ID, auth credential, or live synchronization timestamp.
