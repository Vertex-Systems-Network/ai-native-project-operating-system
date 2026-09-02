# Supervisor Protocol

There must be exactly one active Supervisor per coordination epoch. Read `AGENTS.md`, `.ai/manifest.json`, this file, and `ORCHESTRATOR.md`.

## Lease / election first

Before any coordination write, assignment, review decision, or merge decision:

1. reconcile current `main` and `config/coordination/supervisor-state.json`
2. if a live active Supervisor lease exists, do not compete with it
3. if no live lease exists, acquire the next deterministic epoch election ref using `scripts/supervisor_lease.py --remote-lock` or an equivalent atomic GitHub ref creation
4. persist the winning lease ID, expiry, epoch, election ref, and fencing token
5. verify the current fencing token before every shared-state mutation
6. if the token/epoch becomes stale, become read-only immediately

Failover is allowed only after the prior lease is expired or explicitly relinquished and repository state has been reconciled. A markdown statement or local JSON edit is never sufficient to establish Supervisor authority.

## Responsibilities

The Supervisor owns whole-project awareness, queue integrity, dependency ordering, slot eligibility, stale-claim recovery, shared-write coordination, path ownership, PR/MR review, merge order, quality/security gates, GitHub governance drift, Linear reconciliation, README/dashboard state, merge alerts, maintenance/innovation requests, owner consent routing, protocol migrations, and recovery from inconsistent state. When coordination load permits it also owns one bounded development work unit.

## Startup / resume reconciliation

Inspect at minimum:

- current `main`, branches/claim refs, open PRs/MRs, workflow/check state
- `config/ai/` execution/memory state
- `config/coordination/` queue, Supervisor lease, merge generation, alerts
- `config/traceability/requirements-traceability.json`
- consent/maintenance/design/integration state
- GitHub rules/CODEOWNERS/quality state
- protocol instance/version/migration state
- Linear project state when available

Repair stale mirrors from repository evidence. GitHub remains canonical for code/merge/coordination reality.

## Worker routing and stale claims

Workers atomically claim eligible slots through the deterministic claim ref described in `AUTO-AGENT.md` and `scripts/claim_slot.py`. JSON is the mirror, not the lock.

If a Worker lease expires, do not blindly return the slot to `free`. Inspect the claim ref, Worker branch, commits, PR/review state, current main, and completion evidence, then explicitly renew, recover, supersede, or cancel the claim. Record the decision.

Reserve `SUPERVISOR_ONLY` slots for shared-state, architecture, migrations, release, governance, or coordination-sensitive changes where appropriate.

## Review / merge

Worker review handoff phrase:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

For each submission verify claim/fencing scope, current main generation, diff/contracts, path ownership, traceability, CI/tests, architecture/data/UI/security implications, migration/deployment effects, and merge conflicts. Request/fix bounded issues, rerun impacted checks, and merge only when acceptance gates pass.

After every successful main merge:

1. increment merge generation
2. append merge event
3. create required-action reconciliation alerts for active/affected Workers
4. require stale Workers to integrate current main and reverify before continuing
5. update module/work-unit/traceability state
6. reconcile Linear and README/dashboard state

## Independent review

Supervisor authorship is not independent approval. Prefer an independent reviewer/agent; otherwise require applicable automated gates plus a separate second-pass review context, and require independent human/separate authorized review for high-risk or security-critical self-authored changes.

## Maintenance / innovation / protocol updates

Follow `CONTINUOUS-IMPROVEMENT.md` for technology and optional innovation cycles. Material changes require the appropriate owner consent record before implementation.

For upstream ANPOS changes, use `config/protocol/version.json` and `config/protocol/migrations.json`. Compare control-plane changes, identify project-specific conflicts, migrate incrementally, and never overwrite project implementation/approved architecture blindly.

## Linear

While a persistent Supervisor runtime genuinely exists, reconcile GitHub ↔ Linear at least hourly and on material events. If no persistent runtime exists, record degraded mode and catch up on next invocation rather than claiming background synchronization occurred.

## Runtime boundary

Repository files define the protocol; they do not themselves create a persistent reasoning service. A GitHub App, self-hosted orchestrator, CI-connected agent host, or equivalent runtime must implement `ORCHESTRATOR.md` for continuous autonomous operation.
