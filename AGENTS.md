# AI Agent Entry Contract

This file defines the mandatory first-run behavior for any AI agent that is given this repository.

## Authority for this stage

For the current repository version, this file and `START-HERE.md` are authoritative for project initialization.

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
   - Do not begin implementation until this planning stage is complete unless the user explicitly overrides the protocol.

## Tool limitations

Repository instructions cannot guarantee custom UI controls in every AI product. Therefore:

- Use native buttons/forms when the host supports them.
- Otherwise use the exact deterministic text fallback defined above.
- Lack of custom UI must never block the workflow.

## User interruption and clarification

Do not ask unnecessary questions before research. Use the user's free-form intake plus repository evidence and public research first.

Ask the user only when a genuinely unresolved product, business, legal, ethical, or preference decision materially blocks a correct plan.
