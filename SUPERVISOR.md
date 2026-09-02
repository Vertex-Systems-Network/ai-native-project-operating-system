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
- 24-hour technology-update audit requests
- optional innovation-scout research requests
- owner consent request preparation/tracking
- authorized owner email notifications for material update proposals
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
8. inspect `config/maintenance/`, `config/consent/`, and `config/notifications/`
9. inspect open `[AI-NATIVE]` maintenance/scout requests created by scheduled workflows
10. reconcile Linear when available
11. repair stale/inconsistent coordination state from repository evidence

## Worker routing

The Supervisor prepares valid free slots based on the approved execution graph.

A newly arriving worker does not require conversational hand-assignment. It reads `AUTO-AGENT.md` and deterministically claims the highest-priority valid free eligible slot after reconciling current main and any required-action alerts.

The Supervisor may reserve `SUPERVISOR_ONLY` slots for shared-state, architecture, release, migration, maintenance, or coordination-sensitive work. Otherwise it should also claim and execute a bounded `ANY`/eligible module itself.

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

## Technology update maintenance requests

When `[AI-NATIVE] Technology Update Audit Due` exists, follow `CONTINUOUS-IMPROVEMENT.md`.

The Supervisor must research technologies actually used by the project against current authoritative sources. It must not infer that a new release should automatically be installed.

For actionable candidates:

1. prepare compatibility/breaking/security/EOL/migration analysis
2. prepare bounded implementation, testing, deployment, and rollback plan
3. create a pending entry in `config/consent/consent-requests.json`
4. resolve the authorized owner contact from `config/notifications/project-owner.json` or an authorized connected contact source
5. send an owner email through an authorized provider when available
6. include the candidate updates, impact, risk, recommendation, plan reference, and consent ID
7. use `Approve & Start Update` only when an authenticated one-click action can securely record consent and launch/queue the approved work
8. otherwise use the canonical review link and exact approval fallback `APPROVE UPDATE <CONSENT-ID>`
9. do not create update implementation slots until consent is verified

After approval, convert only the approved scope into bounded maintenance slots and require full relevant QA/security/regression/build/deployment/rollback verification after implementation.

Never guess or scrape a private owner email.

## Optional innovation scout

The 25-hour innovation scout is disabled by default and may only become enabled after explicit owner consent recorded in `config/maintenance/innovation-scout.json`.

When `[AI-NATIVE] Innovation Scout Due` exists:

1. research current market/category/technology changes
2. compare candidate new options/modules/systems/integrations against actual project needs
3. avoid novelty bias and unnecessary complexity
4. record worthwhile candidates as proposed, not active scope
5. present owner-selectable suggestions
6. require owner consent before promoting proposals into the Modules Bank/execution plan
7. route approved changes back through appropriate system design/architecture/data flow/UI/UX/security/QA planning before development

Preferred owner actions:

- `Approve Selected Suggestions`
- `Review Suggestions`
- `No Changes This Cycle`
- `Disable Innovation Scout`

## Hourly Linear reconciliation

While a persistent Supervisor run is active, perform GitHub ↔ Linear progress reconciliation at least hourly. Also sync immediately on material events, including approved maintenance or innovation-scope changes.

If the runtime cannot remain active or schedule itself, do not claim continuous hourly execution. On the next run, perform catch-up reconciliation and record the last successful sync.

## Supervisor development work

The Supervisor must not be coordination-only by default. When the review/coordination queue permits, it should own one bounded module/work unit selected from eligible work, while preserving enough capacity to interrupt itself for critical reviews, merge conflicts, maintenance consent, security/QA blockers, and shared-state coordination.
