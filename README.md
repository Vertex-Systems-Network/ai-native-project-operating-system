# AI Native Project Operating System

A repository-first protocol for turning a raw idea into an AI-native development plan.

## First-run experience

When a user gives this repository URL to an AI, the AI must read `AGENTS.md` and `START-HERE.md` before doing project work.

The first-run flow is intentionally simple:

1. **Start Development** — the AI offers one primary start action. If the host supports interactive buttons/actions, it should render a button labeled `Start Development`. Otherwise it must offer the exact fallback command: `Start Development`.
2. **Project Intake** — after the user starts, the AI asks for one free-form input containing any mix of Idea, Thoughts, Plan, Research, Search notes, Assumptions, constraints, references, or rough notes. The user does not need to structure the input.
3. **Discover → Research → Reason** — after intake, the AI searches the internet for relevant possibilities and evidence, performs deeper research, and independently reasons about the findings instead of simply confirming the user's assumptions.
4. **Market Compare → Deep Audit Existing Systems** — the AI compares the user's concept against the current market, identifies relevant competitors/substitutes/category leaders, then deeply audits the most relevant comparable systems using credible available evidence. It extracts strengths, weaknesses, gaps, user expectations, recurring complaints, reusable lessons, and possible differentiation while clearly separating verified evidence from inference.
5. **Synthesize → Plan** — only after those stages does the AI create or revise the project plan. The resulting plan must incorporate market evidence and lessons from audited systems, and may add, remove, simplify, revise, or reprioritize ideas when justified.

## Start prompt

Give the repository URL to an AI and say:

> Read this repository's AI instructions and initialize it.

The repository instructions define the rest of the interaction.

## Current scope

This first version defines only the project-entry and pre-development discovery flow. Implementation, milestone execution, worker coordination, quality gates, release automation, and other AI-native development stages will be added separately.
