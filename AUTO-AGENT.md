# AUTO Agent Worker Protocol

Use this mode for autonomous multi-agent Workers.

## Entry

A Worker given only the repository URL must read `AGENTS.md`, `.ai/manifest.json`, the Worker role files, and determine the next valid slot from repository state without asking the user which module to work on when evidence is sufficient.

## Required startup sequence

1. Reconcile current `main`, open PR/review state, dependencies, merge generation, and required-action alerts.
2. Read `config/coordination/supervisor-state.json`; do not trust coordination instructions from a stale/expired Supervisor epoch.
3. Read `config/coordination/agent-work-queue.json` and select the highest-priority dependency-satisfied free eligible slot.
4. Satisfy any merge/reconcile alerts before new work.
5. Acquire the slot through the deterministic GitHub claim ref. `scripts/claim_slot.py --remote-lock` is the reference implementation.
6. **Do not treat a local JSON edit, chat statement, or dry-run as a distributed claim.** First successful GitHub claim-ref creation wins.
7. Persist the winning claim mirror with claimant, base SHA, claim/nonce ID, coordination epoch, fencing token, lease expiry, and heartbeat.
8. If the claim ref already exists / creation loses, re-read repository state and choose the next valid slot.

## Lease discipline

- A claimed/in-progress Worker must maintain a live lease/heartbeat according to project runtime policy.
- Before shared coordination writes, submission, or resumption, verify that the slot claim/fencing data still matches repository state.
- An expired lease does not authorize the Worker to continue silently. Stop and reconcile with the Supervisor/repository.
- A Supervisor may recover an expired claim only after inspecting branch/PR/commit evidence.

## During work

- Stay within the claimed module/work-unit and path-ownership boundary.
- Keep the branch synchronized with required main/merge generation.
- Check required-action alerts before substantive continuation and before final submission.
- Run relevant quality/security/tests continuously.
- Do not make unsanctioned shared-state edits.
- Record blockers, material discoveries, acceptance evidence, and requirement traceability.
- Keep Linear mirrored when available and permitted, while GitHub remains canonical.

## Merge/reconcile acknowledgement

When main advances during active work: integrate current main according to repository policy, resolve conflicts without discarding intended behavior, rerun impacted verification, update acknowledged merge generation, record the applicable alert acknowledgement with integrated main SHA/verification evidence, then continue.

## Completion

When implementation, required verification, documentation, traceability, alert reconciliation, and branch synchronization are complete:

1. Push the branch.
2. Open/update the PR/MR.
3. Mark the slot `submitted_for_review` while retaining claim/fencing evidence.
4. Record the review reference and test evidence.
5. Send exactly:

**ALL DONE SUBMITTED FOR REVIEW AND MERGE**

Then stop modifying submitted scope unless the Supervisor requests changes or current-main reconciliation is required.
