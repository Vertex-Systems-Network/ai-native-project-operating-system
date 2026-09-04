# ANPOS Commercial Package Architecture

Status: productization design; not launch authorization.

This document translates the capabilities that ANPOS actually implements into a commercial package strategy. It deliberately separates current product truth from future promises. Prices, Marketplace plan IDs, legal rights, support commitments, and launch approval remain operator-controlled.

## Product truth discovered by the repository audit

ANPOS currently provides a broad AI-native project operating protocol rather than a single prompt or coding agent wrapper. Its core customer-facing capability surface includes:

- free-form project intake followed by research, market comparison, comparable-system audit, planning, architecture, technology consent, professional UI/UX, development/DevOps, SQA, and security hardening;
- runtime-discovered project-management selection, including Linear, GitHub Projects, Jira, ClickUp, GitLab, Azure DevOps, Plane, Asana, monday.com, and Notion when the current host has a real connection path;
- runtime-discovered development-AI selection, including Codex/ChatGPT, Claude Code, GitHub Copilot, Gemini, Cursor, Windsurf, and other verified compatible agents;
- Supervisor/Worker multi-agent coordination with identity, permission, claim/lease, fencing, review, and merge controls;
- repository-integrity and stack-specific quality gates plus optional CodeQL, Dependency Review, OSSF Scorecard, Dependabot, governance audit, innovation watch, and technology/protocol update workflows;
- design assurance with responsive evidence, visual-regression expectations, and a default WCAG 2.2 AA web accessibility target;
- data classification/governance, release governance, operational readiness, incident/recovery policy, and continuous-improvement controls;
- an implemented commercial runtime for GitHub Marketplace webhook handling, entitlement reconciliation, signed entitlements, organization seats, private-template archive delivery, and non-destructive cancellation.

These are the strongest current product assets and should be the basis of positioning.

## Audit correction to the existing draft paid catalog

The existing Developer, Pro, Team, and Enterprise IDs are useful compatibility anchors, but the current entitlement labels overstate differentiation if treated as launch-ready features.

The following labels are not yet independently productized enough to sell without qualification:

- `premium_blueprints` — no dedicated premium blueprint content boundary currently exists;
- `premium_provider_adapters` — no dedicated premium adapter layer currently exists;
- `hosted_orchestrator_when_offered` — orchestration protocol exists, but no ANPOS-operated hosted orchestrator is implemented;
- `hosted_or_self_hosted_orchestrator_when_offered` — no supported hosted/self-hosted commercial distribution package exists yet;
- `enterprise_policy_controls` — strong policy foundations exist, but no enterprise-only administration/policy product surface is separately implemented;
- `commercial_support` and `priority_support_or_sla_when_contracted` — these require deliberate operator service terms and legal/operational commitments.

`private_template_access` is technically implemented, but the current commercial-template export is derived from the same canonical ANPOS source after vendor-only assets are removed. Private access by itself therefore should not be the primary reason to pay until the private distribution contains a meaningful licensed/certified/premium value layer.

The authoritative implementation/readiness classification is recorded in `config/licensing/feature-catalog.json`.

## Recommended package model

### ANPOS Community — free acquisition product

Purpose: provide genuine GitHub-integrated value, build adoption, and create the installation base needed for later paid Marketplace eligibility.

Proposed customer value:

- install the public ANPOS Marketplace App;
- run a read-only ANPOS Repository Readiness / Conformance Audit against an authorized repository;
- receive a structured result covering ANPOS presence/version, bootstrap state, repository-integrity posture, available quality/security capabilities, and actionable setup gaps;
- access public documentation and public protocol concepts;
- no private-template entitlement, premium content, hosted orchestration, organization seat entitlement, or paid support.

Launch state: **not implemented yet**. The current commercial service is primarily an entitlement/distribution backend; the free repository-audit product surface must be implemented and production-tested before a free Marketplace listing is submitted. The free plan must provide real integration value beyond authentication or installation counting.

The Community plan should remain outside the current paid `plans` array until its runtime authorization, product UX, tests, and Marketplace plan identity are deliberately implemented and approved.

### ANPOS Developer — individual commercial foundation

Target: solo developers, founders, consultants, and small technical projects that want a supported commercial ANPOS distribution rather than only the public protocol source.

Target deliverables before sale:

- one commercial user/seat;
- operator-approved commercial license/EULA rights;
- certified private ANPOS release distribution with provenance/manifest verification;
- entitled future commercial release/update channel;
- documented standard provider setup/adapters that ANPOS can actually support;
- commercial onboarding and standard support policy if offered.

Current state: **not yet sale-ready**. Distribution runtime exists, but legal rights, private-value differentiation, final update-channel behavior, real Marketplace mapping/pricing, and production launch gates remain unresolved.

### ANPOS Pro — advanced automation and premium assets

Target: power users and professional AI-native developers who need more reusable automation than Developer.

Target deliverables:

- everything in Developer;
- a real versioned Premium Blueprint Pack with clearly enumerated files/capabilities;
- concrete Premium Provider Adapters with supported provider/version matrix and tests;
- advanced governance/automation recipes that are not simply copies of the public core;
- hosted orchestration only after an ANPOS-operated hosted service exists and is production-certified.

Current state: **blocked on premium product implementation**. Do not market `premium_blueprints`, `premium_provider_adapters`, or hosted orchestration as active customer value until the private premium layer exists.

### ANPOS Team — organization collaboration

Target: engineering teams using ANPOS across several developers.

Target deliverables:

- everything in Pro;
- organization purchasing and seat capacity;
- admin seat assign/list/revoke flows;
- principal-bound organization entitlements;
- team onboarding and access reconciliation;
- customer-facing team administration/billing experience;
- defined commercial support scope.

Current state: **partially implemented**. Seat enforcement and organization entitlement mechanics exist in the commercial service; the complete production/customer experience and all Pro dependencies still need to be finished and verified.

### ANPOS Enterprise — controlled rollout and contracted service

Target: organizations requiring policy governance, self-hosting/controlled deployment, procurement, and contractual support.

Target deliverables before offering:

- everything in Team;
- enterprise-only policy/control packs or administration surfaces that are concretely distinct from the public core;
- organization rollout/governance guidance and audit evidence;
- self-hosted orchestrator/distribution option only if actually productized and supportable;
- security/privacy deployment boundary documentation;
- negotiated support/SLA, legal terms, and enterprise onboarding.

Current state: **future / contract-led**. It should not be presented as a standard self-serve Marketplace plan until the enterprise-exclusive surfaces and operating model exist. A custom external contract may be more appropriate initially.

## Recommended pricing position after differentiation is implemented

Pricing below is a product-positioning target, not an authorized billing configuration and must not be written into live Marketplace settings without operator approval.

| Package | Suggested target | Annual target | Pricing logic |
| --- | ---: | ---: | --- |
| Community | $0 | $0 | Adoption + genuine Marketplace-integrated repository audit |
| Developer | $19/month | $190/year | Commercial individual distribution, certified releases, update access |
| Pro | $39/month | $390/year | Developer + real premium blueprint/adapter layer |
| Team | $29–39/user/month | annual discount | Pro + organization seats/admin/support; use per-unit pricing when suitable |
| Enterprise | Custom | Annual contract | Policy/control, deployment, procurement, SLA/support commitments |

ANPOS currently does not include bundled LLM inference/compute. Until hosted orchestration or other high-cost services exist, pricing should not assume the cost/value profile of products that bundle large AI usage quotas.

## Package implementation order

1. **Feature truth** — maintain `config/licensing/feature-catalog.json` and prevent unsupported package claims.
2. **Community product** — implement the read-only repository readiness/conformance audit and its customer-facing Marketplace flow.
3. **Developer foundation** — finalize commercial legal rights, certified private release value, update-channel semantics, onboarding, and production distribution.
4. **Premium layer** — create actual premium blueprints/adapters with explicit manifests and tests; only then activate Pro differentiation.
5. **Team product** — complete production seat/admin/billing UX and support policy.
6. **Enterprise product** — build enterprise-only control/deployment assets and contractual operating model.
7. **Pricing activation** — approve real monthly/annual prices and map actual Marketplace plan IDs only after the applicable package is operational.

## Launch rules

- Do not convert an entitlement label into a marketing claim merely because it exists in `product-catalog.json` or `commercial-service/lib/plans.ts`.
- Do not call a capability hosted unless an ANPOS-operated production service actually exists and has production evidence.
- Do not call all listed PM systems or AI agents bundled integrations; they are selectable only when the customer host/runtime exposes a real compatible connection/invocation path.
- Do not rely on private-template access alone as premium differentiation while the private export contains no meaningful premium overlay.
- Do not represent the public canonical repository as open source unless an explicit approved license grants those rights; repository visibility is not itself a software license.
- Do not publish Community until it supplies genuine GitHub-integrated value beyond authentication.
- Do not publish paid plans until current GitHub Marketplace requirements and all ANPOS production launch gates are re-verified.
- Cancellation or expiry must remain non-destructive to already-generated customer projects.
