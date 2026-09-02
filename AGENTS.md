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

5. **Project planning**
   - Convert the validated understanding into a coherent project definition and implementation plan.
   - Planning must reflect research findings, repository reality, constraints, and unresolved decisions.
   - Do not begin implementation until this planning stage is complete unless the user explicitly overrides the protocol.

## Tool limitations

Repository instructions cannot guarantee custom UI controls in every AI product. Therefore:

- Use native buttons/forms when the host supports them.
- Otherwise use the exact deterministic text fallback defined above.
- Lack of custom UI must never block the workflow.

## User interruption and clarification

Do not ask unnecessary questions before research. Use the user's free-form intake plus repository evidence and public research first.

Ask the user only when a genuinely unresolved product, business, legal, ethical, or preference decision materially blocks a correct plan.
