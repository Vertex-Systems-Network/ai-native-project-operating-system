# ANPOS Final-Core Runtime — Requirements 35–44

These requirements define the reusable distributed multi-agent control plane that child projects activate from this template. The canonical source remains an inert template/protocol repository.

## 35 — Template Bootstrap / Instance Reset

Child repositories must initialize project identity and clear inherited runtime state before scaling development. `scripts/bootstrap_instance.py` resets project/coordination/consent/Linear runtime identity, creates a new instance UUID, regenerates child CODEOWNERS, and installs child runtime/quality blueprints. It is dry-run by default and refuses to reset the canonical upstream source repo without explicit override.

## 36 — Atomic Worker Claims + Leases

Queue JSON is not a distributed lock. Workers claim a deterministic GitHub ref per coordination epoch/slot. First successful ref creation wins. The queue mirrors claimant, base SHA, claim/nonce ID, lease expiry, epoch, heartbeat, and fencing token. Reference implementation: `scripts/claim_slot.py`.

## 37 — Supervisor Election + Failover

Exactly one Supervisor is active per coordination epoch. Election uses the next deterministic GitHub epoch ref. Active authority requires a live lease and fencing token. Stale Supervisors become read-only. Failover requires expired/relinquished prior authority plus repository reconciliation. Reference implementation: `scripts/supervisor_lease.py`.

## 38 — Durable Orchestrator Runtime Contract

`ORCHESTRATOR.md` defines the responsibilities of a persistent GitHub App/service/self-hosted agent runtime: lease heartbeats, queue dispatch, stale-claim recovery, PR review/merge, alerts, Linear sync, consent routing, maintenance, idempotency, and failover. Repository docs do not falsely claim that a persistent runtime already exists.

## 39 — AI Manifest / Context Router

`.ai/manifest.json` routes agents by role. `AGENTS.md` is a compact universal router rather than an ever-growing master prompt. Agents load common + role-specific instructions only, reducing context cost and instruction collision.

## 40 — Formal State Schemas + State Machine

Core JSON Schemas live in `schemas/`. `config/protocol/state-machine.json` defines legal Worker/Supervisor transitions and fencing invariants. Queue/Supervisor runtime state uses lease-aware schema v2. Repository validation checks these invariants plus the source-template boundary.

## 41 — Protocol Versioning + Upstream Migration Channel

`config/protocol/version.json` records ANPOS version/upstream. `config/protocol/migrations.json` records applied/pending migrations. The canonical source stores `blueprints/github/workflows/protocol-update-watch.yml`; child bootstrap installs it as `.github/workflows/protocol-update-watch.yml`. The child workflow checks for newer upstream protocol versions and opens a migration control item without modifying project code automatically.

## 42 — Thin AI Vendor Adapters

Vendor adapters route Claude Code, Gemini, GitHub Copilot, Cursor, and Windsurf to `AGENTS.md` + `.ai/manifest.json`. They do not duplicate the full protocol.

## 43 — Requirements Traceability

`config/traceability/requirements-traceability.json` maintains Requirement → Option → Module → Work Unit → Branch/PR → Test Evidence → Release links. Code existence alone never marks a requirement verified.

## 44 — Path Ownership / CODEOWNERS

`config/github/path-ownership.json` defines role ownership for shared/high-risk paths. `.github/CODEOWNERS` provides a source-template baseline. Child repositories regenerate valid owner/team identities during bootstrap.

## Source vs child invariant

**Canonical source stores instructions and inactive blueprints. Child repositories activate integrations/workflows/project state. GitHub refs arbitrate ownership; JSON mirrors state; fencing tokens prevent stale leaders/workers from mutating shared coordination state. GitHub code/branch/PR/merge reality remains canonical.**
