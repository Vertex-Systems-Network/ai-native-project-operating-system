# AI Native Project Operating System

A repository-first protocol for turning a raw idea into a researched, designed, engineered, tested, and security-hardened AI-native software project.

## First-run experience

When a user gives this repository URL to an AI, the AI must read `AGENTS.md` and `START-HERE.md` before doing project work.

The flow is intentionally structured:

1. **Start Development** — the AI offers one primary start action. If the host supports interactive buttons/actions, it should render a button labeled `Start Development`. Otherwise it must offer the exact fallback command: `Start Development`.
2. **Project Intake** — after the user starts, the AI asks for one free-form input containing any mix of Idea, Thoughts, Plan, Research, Search notes, Assumptions, constraints, references, or rough notes. The user does not need to structure the input.
3. **Discover → Research → Reason** — after intake, the AI searches the internet for relevant possibilities and evidence, performs deeper research, and independently reasons about the findings instead of simply confirming the user's assumptions.
4. **Market Compare → Deep Audit Existing Systems** — the AI compares the user's concept against the current market, identifies relevant competitors/substitutes/category leaders, then deeply audits the most relevant comparable systems using credible available evidence. It extracts strengths, weaknesses, gaps, user expectations, recurring complaints, reusable lessons, and possible differentiation while clearly separating verified evidence from inference.
5. **Synthesize → Plan** — only after those stages does the AI create or revise the project plan. The resulting plan must incorporate market evidence and lessons from audited systems, and may add, remove, simplify, revise, or reprioritize ideas when justified.
6. **System Design** — the AI acts as a System Design Engineer and translates the validated plan into a complete system design with boundaries, subsystems, actors, integrations, non-functional requirements, reliability, scalability, security, privacy, observability, deployment environments, failure modes, and extension points.
7. **Technology Recommendation + Consent** — the AI compares the best-fit frontend, backend, database, infrastructure, testing, deployment, and supporting technologies for both current needs and credible future needs. Before detailed implementation architecture or coding, it must request explicit consent using `Approve Technology Stack` as the preferred primary button/action, with `Review Alternatives` where useful. If custom buttons are unavailable, the exact fallback is `Approve Technology Stack`.
8. **Development Architecture** — after technology approval, the AI acts as a Senior Software / Structure Architecture Engineer and defines repository structure, modules, contracts, domain/service boundaries, persistence, APIs, state, integrations, CI/CD, testing architecture, deployment topology, rollback strategy, and engineering conventions.
9. **Data Flow Design** — the AI acts as a Data Flow Engineer and designs end-to-end flows for important reads/writes, actors, APIs, processes, data stores, transformations, third-party integrations, queues/events, trust boundaries, security checkpoints, failures, retries, retention, deletion, and auditing.
10. **Professional UI/UX Design** — the AI acts as a Senior UI/UX Engineer / Product Designer and produces the information architecture, user journeys, task flows, screens, states, component system, responsive behavior, accessibility, onboarding, feedback patterns, and other experience specifications required by the product.
11. **Development + DevOps** — the AI acts as a Senior Developer and DevOps Engineer and implements the approved design incrementally, including frontend, backend, persistence, integrations, automated tests, infrastructure, CI/CD, observability, deployment automation, recovery considerations, and synchronized documentation.
12. **SQA** — the AI switches to an independent SQA Engineer mindset and validates the system using the relevant static analysis, unit, integration, contract, E2E, regression, cross-browser, responsive, accessibility, localization, concurrency, failure/retry, performance, deployment, backup/restore, upgrade, and rollback tests.
13. **Security Engineering + Authorized Adversarial Assessment** — the AI acts as a Security Engineer and Ethical Hacker. It may use white-hat, realistic hostile/black-hat-style, green-hat/novice misuse, insider, and automated-abuse perspectives only as defensive threat-modeling and controlled-testing lenses against explicitly authorized project scope. Material findings must be remediated and retested before release readiness.

Security is treated as a cross-cutting engineering responsibility from system design onward; the final security phase is a dedicated hardening and adversarial verification pass, not the first time security is considered.

Detailed post-planning responsibilities are defined in `DEVELOPMENT-LIFECYCLE.md`.

## Start prompt

Give the repository URL to an AI and say:

> Read this repository's AI instructions and initialize it.

The repository instructions define the rest of the interaction.

## Current scope

The repository now defines the project-entry, discovery, research, market analysis, planning, system design, technology-consent, development architecture, data-flow, UI/UX, implementation/DevOps, software QA, and authorized security-hardening lifecycle.

Later versions can extend this foundation with milestone execution, multi-agent worker coordination, state machines, task queues, release governance, production certification, and other orchestration layers.
