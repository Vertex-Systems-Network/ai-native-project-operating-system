# Supervisor Protocol

There must be exactly one active Supervisor for a coordination epoch.

## Responsibilities

The Supervisor owns:

- whole-project situational awareness
- queue integrity and slot availability
- dependency ordering
- worker assignment eligibility
- shared-write coordination
- merge order
- PR/MR review
- corrective review work where safe
- Linear planning/progress reconciliation
- README dashboard refresh
- repository-backed merge alerts and acknowledgements
- recovery from stale claims or inconsistent state
- one bounded development module/work unit whenever coordination load permits

## Startup / resume

Before changing files:

1. reconcile current `main`
2. inspect open PRs/MRs and active claim branches
3. inspect `config/coordination/agent-work-queue.json`
4. inspect `config/coordination/supervisor-state.json`
5. inspect `config/coordination/merge-events.json`
6. inspect `config/coordination/agent-alerts.json`
7. inspect AI memory/execution state under `config/ai/`
8. reconcile Linear when available
9. repair stale/inconsistent coordination state from repository evidence

## Worker routing

The Supervisor prepares valid free slots based on the approved execution graph.

A newly arriving worker does not require conversational hand-assignment. It reads `AUTO-AGENT.md` and deterministically claims the highest-priority valid free eligible slot after reconciling current main and any required-action alerts.

The Supervisor may reserve `SUPERVISOR_ONLY` slots for shared-state, architecture, release, migration, or coordination-sensitive work. Otherwise it should also claim and execute a bounded `ANY`/eligible module itself.

## Review queue

Worker review handoff phrase:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

For every submitted PR/MR:

1. verify claimed scope and base generation
2. inspect diff and affected contracts
3. run/inspect relevant CI and tests
4. validate architecture/data-flow/UI/UX/security implications
5. check shared-write conflicts and merge order
6. request changes or make bounded fixes where needed
7. rerun impacted verification
8. merge only when acceptance gates pass
9. increment merge generation
10. append merge event
11. broadcast a repository-backed required-action alert to active/affected workers
12. mark module/work unit merged/completed as appropriate
13. update Linear
14. update README dashboard

## Independent review rule for Supervisor-authored work

The Supervisor may develop a bounded module, but it must not equate authorship with independent approval.

For Supervisor-authored submissions:

- use an independent eligible reviewer/agent when available
- otherwise require all applicable automated quality/security/test gates and perform a clearly separate second-pass review context
- record when true reviewer independence was unavailable
- require an independent human or separate authorized reviewer for high-risk/security-critical self-authored changes before merge

## Merge alert

After every main merge, all active workers whose acknowledged generation is older than current main are considered stale until they reconcile.

The Supervisor must:

1. increment merge generation
2. record the merge in `config/coordination/merge-events.json`
3. create a required-action entry in `config/coordination/agent-alerts.json`
4. identify all active or affected worker slots
5. require each worker to integrate current main, resolve conflicts, rerun impacted checks, and acknowledge the alert before substantive development continues
6. mirror the reconcile requirement in Linear when available

Direct chat push is optional; repository alert state is mandatory and authoritative.

## Hourly Linear reconciliation

While a persistent Supervisor run is active, perform GitHub ↔ Linear progress reconciliation at least hourly. Also sync immediately on material events.

If the runtime cannot remain active or schedule itself, do not claim continuous hourly execution. On the next run, perform catch-up reconciliation and record the last successful sync.

## Supervisor development work

The Supervisor must not be coordination-only by default. When the review/coordination queue permits, it should own one bounded module/work unit selected from eligible work, while preserving enough capacity to interrupt itself for critical reviews, merge conflicts, security/QA blockers, and shared-state coordination.
