# ANPOS 1.4.0 / Commercial Service 0.4.4

Status: **customer-facing release draft; not publication evidence**.

Commercial service 0.4.4 adds a signed remote ephemeral production sandbox driver source, immutable GitHub commit workspace binding, sandbox readiness reporting, and a fail-closed live Repository Supervisor E2E verifier with separate read / write_prepare / write_verify_merge phases. Live sandbox-gateway and production GitHub E2E receipts remain pending external evidence.

Commercial service 0.4.4 includes the GitHub-backed MCP OAuth 2.1 transport and adds the guarded Repository Supervisor write foundation: a dedicated installable Supervisor GitHub App role, encrypted server-issued write-plan ledger, exact expected-head and plan-hash binding, bounded secret/path checks, atomic Git Data feature-branch commits, pull-request creation/re-read, exact commit CI inspection, and guarded merge with resulting-default-branch verification. Marketplace billing/Community App permissions remain read-only and are not widened. Full bootstrap/adoption/upgrade plan generation and production write E2E remain pending.

This patch adds the server-side Plugin Subscription Entitlement Bridge. It keeps Community readiness auditing bounded, derives paid Repository Supervisor access from the existing commercial entitlement ledger, and keeps unimplemented write capability fail-closed.

## Included source capabilities

- ANPOS protocol 1.4.0 release candidate baseline;
- commercial service 0.4.4 source identity;
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
