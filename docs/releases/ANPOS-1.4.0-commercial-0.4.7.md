# ANPOS 1.4.0 / Commercial Service 0.4.7

Status: **customer-facing release draft; not publication evidence**.

Commercial service 0.4.7 adds source-implemented sandbox-backed apply for **non-empty conflict-free** full Repository Supervisor plans. Verified private-template Git blobs are re-materialized server-side, staged into a signed remote-ephemeral artifact channel, transformed only inside an isolated Python 3.12+ sandbox, SHA-256/output-path verified on return, and committed to one expected-head feature branch without forwarding the customer GitHub token to the sandbox gateway. Full-plan merge additionally requires a persisted sandbox receipt digest.

Commercial service 0.4.7 also implements guarded `bootstrap_empty` source behavior for GitHub's empty-repository constraint. After explicit confirmation and sandbox verification, the service creates one deterministic inert `.anpos-bootstrap-seed` root commit through the Contents API, verifies zero parents and exact default-branch head, creates the full ANPOS feature-branch commit on that seed while deleting the seed, and retains PR/CI/merge gates. Any post-seed failure becomes recovery-required rather than silently resetting the plan.

This does **not** claim that the live sandbox gateway is deployed, migration 006 is applied in production, private vendor repositories exist, or production full-plan/empty-bootstrap E2E has passed. Plans containing manual-merge/migration-review conflicts remain blocked.

Commercial service 0.4.7 adds deterministic full Repository Supervisor no-write planning for bootstrap-empty, copied-template bootstrap, existing-repository adoption, partial repair, and active-project upgrade. Plans are bound to the exact verified private-template release and immutable target Git tree, preserve target-only application files and project-specific Requirements 83–96 evidence, and return bounded MCP previews while retaining the complete encrypted plan server-side. Full-mode apply remains fail-closed pending the separately certified sandbox-backed apply runtime. The signed remote sandbox driver and live E2E harness remain source-implemented with live external evidence pending.

Commercial service 0.4.7 includes the GitHub-backed MCP OAuth 2.1 transport and adds the guarded Repository Supervisor write foundation: a dedicated installable Supervisor GitHub App role, encrypted server-issued write-plan ledger, exact expected-head and plan-hash binding, bounded secret/path checks, atomic Git Data feature-branch commits, pull-request creation/re-read, exact commit CI inspection, and guarded merge with resulting-default-branch verification. Marketplace billing/Community App permissions remain read-only and are not widened. Full bootstrap/adoption/upgrade plan generation and production write E2E remain pending.

This patch adds the server-side Plugin Subscription Entitlement Bridge. It keeps Community readiness auditing bounded, derives paid Repository Supervisor access from the existing commercial entitlement ledger, and keeps unimplemented write capability fail-closed.

## Included source capabilities

- ANPOS protocol 1.4.0 release candidate baseline;
- commercial service 0.4.7 source identity;
- Requirements 83–88 AI-native product assurance;
- Requirements 89–96 AI-native governance assurance;
- unified assurance state for Requirements 83–96;
- strict specialized JSON Schemas for product/governance assurance policies;
- conformance coverage through CONF-038;
- child bootstrap initialization for assurance, research evidence, compliance, ADR, AI asset, runbook, audit and risk state;
- split Marketplace App / Vendor Distribution App runtime contract preserved;
- fail-closed customer release provenance and production verification boundaries preserved.

## Child migration boundary

Adopting 1.4.0 must be non-destructive. Existing child repositories preserve application code, approved architecture, CI/deployment behavior, legal/commercial terms and already verified project evidence. New Requirements 83–96 controls are classified by actual applicability and do not become pass evidence merely because the protocol files exist.

## Publication boundary

This note becomes a shipped customer release only after `config/release/customer-release-provenance.json` records the exact canonical source revision/tree, immutable artifact digest, deterministic vendor handoff receipt and publication reference.

Repository certification proves the source/build contract only. It does not by itself prove a customer artifact was published or that an external commercial deployment is live.
