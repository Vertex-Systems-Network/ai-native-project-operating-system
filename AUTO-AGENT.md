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
6. Reconcile current `main`, open review state, dependencies, and merge generation.
7. Claim the highest-priority valid free slot for which the worker is eligible.
8. Use the slot's deterministic claim branch.
9. Do not ask the user which module to work on unless repository evidence contains a genuine unresolved human decision.

## During work

- Stay within the claimed module/work-unit boundary.
- Keep the branch synchronized with required main/merge generation.
- Run relevant tests and verification continuously.
- Do not make unsanctioned shared-state edits.
- Record blockers and material discoveries.
- Keep Linear mirrored when the connector is available and the protocol permits worker updates.

## Completion

When implementation, verification, documentation, and branch synchronization are complete:

1. Push the branch.
2. Open/update the PR/MR.
3. Mark the slot `submitted_for_review`.
4. Record the review reference.
5. Send exactly:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

Then stop modifying the submitted scope unless the Supervisor requests changes or the branch must be reconciled after a new main merge.
