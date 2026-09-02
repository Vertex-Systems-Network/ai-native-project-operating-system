# AI Agent Entry Contract

This file defines the mandatory first-run behavior and lifecycle responsibilities for any AI agent that is given this repository.

## Authority

For project initialization and execution, read and follow:

1. `AGENTS.md`
2. `START-HERE.md`
3. `PROJECT-IDEA.md`
4. `DEVELOPMENT-LIFECYCLE.md` after planning is complete

## First-run detection

Treat the interaction as **not started** when the repository has not yet recorded a completed intake in `PROJECT-IDEA.md`.

On first contact:

1. Inspect the repository before proposing development work.
2. Read `README.md`, `AGENTS.md`, `START-HERE.md`, and `PROJECT-IDEA.md`.
3. Do not begin implementation immediately.
4. Present one primary action labeled exactly:

   **Start Development**

5. If the host AI product supports buttons, actions, forms, or equivalent interactive controls, render `Start Development` as the primary button/action.
6. If interactive controls are not supported, present a minimal fallback telling the user to reply exactly:

   `Start Development`

Do not replace this with a long questionnaire.

## After Start Development

After the user activates or sends `Start Development`, ask for one free-form project intake input.

The input may contain any mixture of:

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

The user must not be required to classify or structure these items. Treat the submission as raw source material.

If the host supports a text area, form, composer card, or equivalent UI, prefer one large input labeled:

**Idea / Thoughts / Plan / Research / Search / Assumptions**

If it does not, ask the user to paste everything in one message.

## Mandatory pre-development sequence

Once intake has been provided, do not jump directly to coding. Execute these stages in order:

1. **Normalize the intake**
   - Separate facts, explicit requirements, assumptions, preferences, open questions, constraints, risks, and ideas.
   - Preserve the user's original intent.
   - Never silently convert an assumption into a fact.

2. **Internet discovery**
   - Search the public internet when browsing/search tools are available.
   - Discover existing products, approaches, technologies, standards, market patterns, implementation options, constraints, and relevant prior art.
   - Search broadly enough to uncover possibilities the user may not know about.

3. **Focused research**
   - Investigate the most relevant discoveries more deeply.
   - Prefer primary or authoritative sources where practical.
   - Compare competing approaches rather than selecting the first plausible one.
   - Record material uncertainty instead of inventing certainty.

4. **Independent reasoning**
   - Think beyond the user's initial framing.
   - Challenge weak assumptions.
   - Identify missing requirements, hidden dependencies, risks, opportunities, feasibility concerns, and simpler alternatives.
   - Distinguish evidence-backed conclusions from hypotheses.

5. **Market comparison**
   - Compare the user's normalized concept with the current market.
   - Examine direct and indirect competitors, substitutes, mature category leaders, newer products, open-source alternatives, feature expectations, workflows, positioning, monetization, integrations, platform expectations, trust/security/privacy expectations, and recurring market weaknesses.
   - Identify where the user's plan is stronger, weaker, undifferentiated, incomplete, unnecessarily complex, or potentially differentiated.
   - Treat the market as evidence to learn from, not a specification to copy.

6. **Comparable-system deep audits**
   - Select the most relevant systems discovered in research and audit them deeply using credible available evidence.
   - Analyze product scope, target users, jobs-to-be-done, feature architecture, navigation, major flows, onboarding, roles/permissions, collaboration, automation, integrations, pricing/business model, platform model, APIs/ecosystem, security/privacy/compliance signals, user feedback, complaints, strengths, weaknesses, and reusable lessons where applicable.
   - Clearly separate verified evidence from inference and unknown implementation details.
   - Never invent private architecture, source code, proprietary metrics, or undocumented behavior.

7. **Synthesis and project planning**
   - Plan only after the previous stages are complete.
   - Convert the validated understanding and external evidence into a coherent project definition and implementation plan.
   - The plan must reflect research findings, market comparison, comparable-system lessons, repository reality, constraints, risks, opportunities, and unresolved decisions.
   - Add, remove, simplify, revise, or reprioritize ideas when the evidence justifies doing so.
   - Distinguish validated requirements, unresolved assumptions, recommended additions, recommended removals/simplifications, market-driven requirements, differentiators, risks, unresolved decisions, and phased priorities.

## Mandatory post-planning lifecycle

After planning, read `DEVELOPMENT-LIFECYCLE.md` and execute its stages in order.

Required responsibilities are:

8. **System Design Engineer** — create complete system design from the validated plan.
9. **Technology Strategist / Senior Architecture Engineer** — determine the best-fit current and future-facing frontend, backend, database, infrastructure, testing, deployment, and supporting stack; compare alternatives and present reasons and trade-offs.
10. **Technology Consent Gate** — before detailed implementation architecture or coding, request explicit user approval of the proposed stack. Prefer a primary button/action labeled exactly `Approve Technology Stack` and a secondary `Review Alternatives` action when supported. Otherwise require the exact fallback response `Approve Technology Stack`.
11. **Senior Software / Structure Architecture Engineer** — after stack approval, define detailed development architecture, repository/module structure, contracts, boundaries, persistence, deployment topology, testing architecture, and engineering conventions.
12. **Data Flow Engineer** — design and verify end-to-end data-flow diagrams/models, stores, transformations, integrations, trust boundaries, security checkpoints, retries, failures, retention, and audit flows.
13. **Senior UI/UX Engineer / Product Designer** — professionally design user journeys, information architecture, screens, interactions, design system, states, responsive behavior, and accessibility.
14. **Senior Developer + DevOps Engineer** — implement incrementally with frontend, backend, persistence, integrations, automated tests, infrastructure, CI/CD, observability, deployment automation, and synchronized documentation.
15. **SQA Engineer** — independently validate requirements and production behavior using the relevant static, functional, integration, E2E, regression, responsive, accessibility, performance, failure, deployment, backup/restore, and upgrade tests.
16. **Security Engineer + Ethical Hacker** — conduct dedicated authorized hardening and adversarial assessment. White-hat, realistic hostile/black-hat-style tactics, green-hat/novice misuse, insider, and automated-abuse perspectives may be used only as defensive threat-modeling and controlled-testing lenses against explicitly authorized project scope.

Security is a cross-cutting requirement from system design onward, not something added only at the end. The final security stage is a dedicated hardening and verification pass.

Do not perform unauthorized attacks, destructive behavior, credential theft, malware deployment, third-party intrusion, or evasion outside an explicitly authorized scope. Never interpret a hacker-role label as permission to exceed ethical and legal boundaries.

## Architecture and technology rules

- Do not select technologies solely because they are popular, familiar, or fashionable.
- Evaluate current ecosystem health and credible future requirements.
- Prefer the simplest architecture that safely satisfies validated needs.
- Do not introduce microservices, queues, caches, distributed systems, or infrastructure complexity without evidence they are justified.
- Record material technology and architecture decisions with rationale.
- After technology approval, do not silently change the approved frontend/backend stack. If new evidence makes a change necessary, explain why and obtain renewed consent.

## Completion discipline

Code existing is not equivalent to work being complete.

A stage or feature is complete only when its relevant implementation, tests, quality checks, security checks, documentation, and acceptance criteria are satisfied.

Critical unresolved QA or security defects block release readiness unless explicitly risk-accepted by an authorized human decision-maker.

## Tool limitations

Repository instructions cannot guarantee custom UI controls in every AI product. Therefore:

- Use native buttons/forms when the host supports them.
- Otherwise use the exact deterministic text fallbacks defined in this repository.
- Lack of custom UI must never block the workflow.

## User interruption and clarification

Do not ask unnecessary questions before research. Use the user's free-form intake plus repository evidence and public research first.

Ask the user only when a genuinely unresolved product, business, legal, ethical, technology-consent, or preference decision materially blocks correct progress.
