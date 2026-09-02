# Durable Orchestrator Contract

ANPOS distinguishes repository protocol from a persistent AI runtime. GitHub Actions can schedule and persist signals, but they do not by themselves provide a continuously reasoning Supervisor.

## Required runtime responsibilities

A durable Supervisor/orchestrator implementation should:

1. acquire an epoch-fenced Supervisor lease through `scripts/supervisor_lease.py` or an equivalent atomic GitHub-ref operation
2. heartbeat the lease and stop all coordination writes immediately when its fencing token is stale
3. reconcile `main`, open PRs, claim refs, queue state, alerts, consent state, quality/governance state, selected PM-provider state, and repository memory before dispatch
4. generate/refresh eligible work slots from the approved execution graph
5. invoke or hand work to only development agents that are actually selected, available, and authorized
6. require atomic claim ownership before a Worker starts substantive changes
7. monitor Worker heartbeats/lease expiry and recover stale claims safely
8. process review submissions, quality/security gates, merge order, and merge-generation alerts
9. perform event-driven selected-PM-provider/README/state reconciliation
10. process scheduled technology and optional innovation requests
11. enforce owner consent gates and repository governance
12. maintain idempotency: replaying an event must not create duplicate modules, slots, consent records, PM items, or merges

## Project-management adapter boundary

Use `PROJECT-MANAGEMENT.md` and `config/integrations/project-management.json`.

The orchestrator must not hard-code Linear/Jira/ClickUp/etc. semantics into core dispatch logic. Provider-specific APIs/MCP calls are adapters behind the common ANPOS operations for projects, milestones, tasks, assignments, blockers, review links, merges, and progress.

If no PM provider is selected, repository-backed planning remains sufficient. If a provider is selected but unavailable, record degraded sync and catch up later.

## Development-agent boundary

Use `config/ai/agent-catalog.json` as the selected runtime pool. Candidate product names are not proof of availability. The orchestrator must only invoke/hand off to agents verified as usable in the current environment and authorized for the assigned role.

## Supported deployment shapes

The protocol is implementation-neutral. A durable runtime may be a GitHub App, self-hosted service/runner, CI-connected agent service, or another authenticated orchestration host. The repository must not pretend such a runtime exists merely because this contract is present.

## Fencing rule

Every shared-state write, Worker reassignment, review decision, merge decision, and coordination mutation must verify the current `coordination_epoch` and `fencing_token` from `config/coordination/supervisor-state.json`. A stale Supervisor must become read-only.

## Worker lease recovery

Expired Worker leases do not automatically prove that the Worker branch is disposable. Before reopening a slot, the Supervisor must inspect the claim ref, Worker branch/PR, commits, review state, and main divergence, then either renew, recover, supersede, or cancel the stale claim with evidence.

## Event sources

Recommended event inputs include GitHub push/PR/review/workflow events, scheduled maintenance events, selected-PM-provider changes where available, consent decisions, Worker heartbeats, and Supervisor heartbeat/lease expiry.

## Runtime safety

- never run arbitrary untrusted PR code with privileged credentials
- use least-privilege GitHub and provider permissions and short-lived credentials where possible
- serialize shared coordination writes or use optimistic concurrency checks
- keep project code canonical in GitHub and planning-mirror canonicality separate
- record degraded mode when an integration is unavailable
- never treat an unavailable provider/agent as connected merely because a configuration entry exists

## Completion

The orchestrator itself is considered production-ready only after failover, duplicate-event, stale-worker, concurrent-claim, stale-Supervisor, merge-during-work, PM-provider outage/switch, agent unavailability, and integration-outage scenarios have been tested.
