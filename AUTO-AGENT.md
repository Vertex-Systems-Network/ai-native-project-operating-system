# AUTO Agent Worker Protocol

Use this mode for autonomous multi-agent workers.

## Entry

A worker given only the repository URL must read the root contracts and determine its next valid slot from repository state.

## Required startup sequence

1. Read `AGENTS.md`.
2. Read `AI-NATIVE-EXECUTION.md`.
3. Read `MULTI-AGENT-ORCHESTRATION.md`.
4. Read `config/coordination/agent-work-queue.json`.
5. Read `config/coordination/supervisor-state.json`.
6. Read `config/coordination/agent-alerts.json`.
7. Reconcile current `main`, open review state, dependencies, merge generation, and required-action alerts.
8. If an applicable merge/reconcile alert is open, integrate current main, resolve conflicts, rerun impacted verification, and acknowledge the alert before new substantive work.
9. Claim the highest-priority valid free slot for which the worker is eligible.
10. Use the slot's deterministic claim branch.
11. Do not ask the user which module to work on unless repository evidence contains a genuine unresolved human decision.

## During work

- Stay within the claimed module/work-unit boundary.
- Keep the branch synchronized with required main/merge generation.
- Check applicable required-action alerts before substantive continuation and before final submission.
- Run relevant tests and verification continuously.
- Do not make unsanctioned shared-state edits.
- Record blockers and material discoveries.
- Keep Linear mirrored when the connector is available and the protocol permits worker updates.

## Merge/reconcile alert acknowledgement

When main advances during active work:

1. fetch current main
2. integrate/rebase/merge it according to repository policy
3. resolve conflicts without silently discarding either side's intended behavior
4. rerun impacted tests/verification
5. update the slot's acknowledged merge generation
6. add the worker acknowledgement to the relevant entry in `config/coordination/agent-alerts.json` when permitted
7. include the integrated main SHA and verification status in the acknowledgement
8. only then continue substantive development

## Completion

When implementation, verification, documentation, alert reconciliation, and branch synchronization are complete:

1. Push the branch.
2. Open/update the PR/MR.
3. Mark the slot `submitted_for_review`.
4. Record the review reference.
5. Send exactly:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

Then stop modifying the submitted scope unless the Supervisor requests changes or the branch must be reconciled after a new main merge.
