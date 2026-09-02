# AI Agent Entry Contract

This file defines the mandatory behavior for any AI agent that is given this repository.

## Authority and required reading

For project initialization and execution, read and follow:

1. `AGENTS.md`
2. `START-HERE.md`
3. `PROJECT-IDEA.md`
4. `DEVELOPMENT-LIFECYCLE.md` after planning is complete
5. `AI-NATIVE-EXECUTION.md` before choosing or resuming implementation work
6. the repository-backed state and planning artifacts under `config/ai/` and `docs/ai/`

Repository reality is the continuity layer. Conversation memory is never the sole source of truth.

## First-run detection

Treat the interaction as **not started** when the repository has not yet recorded a completed intake in `PROJECT-IDEA.md`.

On first contact:

1. Inspect the repository before proposing development work.
2. Read the required root instructions.
3. Do not begin implementation immediately.
4. Present one primary action labeled exactly **Start Development**.
5. If the host supports buttons/actions/forms, render `Start Development` as the primary action.
6. Otherwise ask the user to reply exactly `Start Development`.

Do not replace this with a long questionnaire.

## After Start Development

Ask for one free-form project intake that may contain any mixture of:

- Idea
- Thoughts
- Plan
- Existing research
- Search findings or links
- Assumptions
- Problems to solve
- Desired users
- Features
- Business model ideas
- Technical preferences
- Constraints
- Competitors or references
- Uncertainties
- Rough notes

The user must not be required to classify or structure these items.

If the host supports a text area, form, composer card, or equivalent UI, prefer one large input labeled:

**Idea / Thoughts / Plan / Research / Search / Assumptions**

Otherwise ask the user to paste everything in one message.

## Mandatory discovery and planning sequence

Once intake exists, execute these stages in order before coding:

1. **Normalize the intake**
   - Separate facts, explicit requirements, assumptions, preferences, open questions, constraints, risks, and ideas.
   - Preserve user intent.
   - Never silently convert an assumption into a fact.

2. **Internet discovery**
   - Search the public internet when browsing/search tools are available.
   - Discover existing products, approaches, technologies, standards, market patterns, implementation options, constraints, and relevant prior art.

3. **Focused research**
   - Investigate the strongest discoveries more deeply.
   - Prefer primary or authoritative sources where practical.
   - Compare competing approaches and record uncertainty.

4. **Independent reasoning**
   - Challenge weak assumptions.
   - Identify missing requirements, dependencies, risks, opportunities, feasibility concerns, and simpler alternatives.
   - Separate evidence-backed conclusions from hypotheses.

5. **Market comparison**
   - Compare the normalized concept with direct/indirect competitors, substitutes, category leaders, newer products, and relevant open-source alternatives.
   - Evaluate features, workflows, positioning, monetization, integrations, platform expectations, trust/security/privacy expectations, recurring weaknesses, and possible differentiation.

6. **Comparable-system deep audits**
   - Audit the most relevant systems using credible available evidence.
   - Examine scope, target users, jobs-to-be-done, feature architecture, navigation, flows, onboarding, roles/permissions, collaboration, automation, integrations, business model, platform model, APIs/ecosystem, security/privacy/compliance signals, user feedback, complaints, strengths, weaknesses, and reusable lessons where applicable.
   - Clearly separate verified evidence, inference, and unknown private implementation details.

7. **Synthesis and project planning**
   - Build the plan only after the prior stages.
   - Add, remove, simplify, revise, or reprioritize ideas when evidence justifies it.
   - Distinguish validated requirements, unresolved assumptions, recommended additions/removals, market-driven requirements, differentiators, risks, unresolved decisions, and phased priorities.

## Mandatory engineering lifecycle

After planning, read and execute `DEVELOPMENT-LIFECYCLE.md`.

Required responsibilities are:

8. **System Design Engineer** — create the complete system design from the validated plan.
9. **Technology Strategist / Senior Architecture Engineer** — compare and recommend the best-fit current and future-facing frontend, backend, database, infrastructure, testing, deployment, and supporting stack.
10. **Technology Consent Gate** — before detailed implementation architecture or coding, request explicit approval. Prefer `Approve Technology Stack` as the primary button/action and `Review Alternatives` where useful. Without interactive UI, require the exact fallback `Approve Technology Stack`.
11. **Senior Software / Structure Architecture Engineer** — after stack approval, define implementation architecture, repository/module structure, contracts, boundaries, persistence, deployment topology, test architecture, and engineering conventions.
12. **Data Flow Engineer** — design and verify end-to-end data flows, stores, transformations, integrations, trust boundaries, security checkpoints, retries, failures, retention, deletion, and audit flows.
13. **Senior UI/UX Engineer / Product Designer** — design user journeys, information architecture, screens, states, responsive behavior, design system, interactions, and accessibility.
14. **Senior Developer + DevOps Engineer** — implement incrementally with frontend, backend, persistence, integrations, automated tests, infrastructure, CI/CD, observability, deployment automation, recovery considerations, and synchronized documentation.
15. **SQA Engineer** — independently validate requirements and production behavior with the relevant static, functional, integration, E2E, regression, responsive, accessibility, performance, failure, deployment, backup/restore, and upgrade tests.
16. **Security Engineer + Ethical Hacker** — conduct authorized hardening and adversarial assessment. White-hat, realistic hostile/black-hat-style, green-hat/novice, insider, and automated-abuse perspectives are defensive lenses only within explicitly authorized project scope.

Security, quality, privacy, accessibility, observability, and operability are cross-cutting requirements throughout the lifecycle.

## AI-native project ownership and continuity

After a validated direction exists, read and follow `AI-NATIVE-EXECUTION.md`.

The AI must treat the repository as an active engineering responsibility rather than a sequence of disconnected prompts. Unless a genuine human decision blocks progress, it should determine the next valid work item itself.

The AI must continuously know, based on repository evidence:

- what is complete
- what is partial
- what remains
- what requires an update
- what requires removal/deprecation
- what is blocked
- where to resume
- what the next valid work item is

Before new work or after an interrupted session, reconcile actual repository/Git/test reality against the persistent memory bank.

Required persistent state:

- `config/ai/project-state.json`
- `config/ai/options-bank.json`
- `config/ai/modules-bank.json`
- `config/ai/execution-plan.json`
- `docs/ai/PRE-PLAN.md`

If these records conflict with verified repository reality, repository reality wins and the records must be repaired.

## Pre-plan, options bank, and modules bank

Before large-scale implementation:

1. Maintain `docs/ai/PRE-PLAN.md` as the living engineering decomposition document.
2. Maintain `config/ai/options-bank.json` as the reusable catalog of discrete product/engineering capabilities.
3. Maintain `config/ai/modules-bank.json` as the canonical catalog of coherent system modules.
4. Attach reusable capabilities to modules by stable option IDs rather than duplicating capability definitions.
5. Keep selected, rejected, deferred, deprecated, and unresolved choices explicit with rationale where material.

## Small executable planning rule

Convert the roadmap into:

**Project → Phase/Milestone → Module → Work Unit → Acceptance/Verification**

Do not treat a phase as one giant implementation task.

Work units should be small enough to understand, implement, review, test, and complete reliably, but not so tiny that coordination overhead exceeds the value of decomposition.

Maintain the active dependency-aware graph in `config/ai/execution-plan.json`.

## Autonomous execution loop

When AI-native development is authorized and no human decision blocks progress, repeatedly:

1. inspect repository reality
2. reconcile persistent project state
3. identify the active phase/module/work unit
4. choose the next valid dependency-satisfied work unit
5. implement a small coherent slice
6. test and verify it
7. update documentation and memory/state artifacts
8. identify newly exposed work, updates, removals, risks, or decisions
9. continue

Do not ask the user which module to work on when repository evidence can determine the answer.

## Architecture and technology rules

- Do not select technologies merely because they are popular, familiar, or fashionable.
- Evaluate ecosystem health and credible future requirements.
- Prefer the simplest architecture that safely satisfies validated needs.
- Do not introduce microservices, queues, caches, distributed systems, or infrastructure complexity without evidence they are justified.
- Record material technology and architecture decisions with rationale.
- After technology approval, do not silently change the approved frontend/backend stack. If new evidence makes a change necessary, explain why and obtain renewed consent.

## Update and deletion discipline

Development includes adding, updating, migrating, deprecating, and removing artifacts.

Never delete or replace working behavior merely because a new approach is preferred. First inspect dependencies, contracts, data migration impact, tests, user-visible behavior, and rollback implications.

Classify obsolete or contradictory work explicitly as update-required, migration-required, removal-required, deprecation-required, or documentation-sync-required.

## Completion discipline

Code existing is not equivalent to work being complete.

A feature/work unit is complete only when relevant implementation, tests, quality checks, security checks, documentation, acceptance criteria, and persistent state are synchronized.

Critical unresolved QA or security defects block release readiness unless explicitly risk-accepted by an authorized human decision-maker.

## Security boundary

Do not perform unauthorized attacks, destructive behavior, credential theft, malware deployment, third-party intrusion, or evasion outside explicitly authorized scope. Hacker-role labels never grant permission to exceed ethical or legal boundaries.

## Tool limitations

Repository instructions cannot guarantee custom UI controls in every AI product. Use native buttons/forms when supported; otherwise use the deterministic text fallbacks defined by this repository. Lack of custom UI must not block the workflow.

## User interruption and clarification

Do not ask unnecessary questions before research or during execution. Use project intake, repository evidence, persistent state, and public research first.

Ask the user only when a genuinely unresolved product, business, legal, ethical, technology-consent, risk-acceptance, or preference decision materially blocks correct progress.
