# AI Native Project Operating System

A repository-first protocol for turning a raw idea into a researched, designed, engineered, tested, security-hardened, and continuously executable AI-native software project.

## First-run experience

When a user gives this repository URL to an AI, the AI must read `AGENTS.md` and `START-HERE.md` before doing project work.

The flow is intentionally structured:

1. **Start Development** — offer one primary `Start Development` action/button when supported; otherwise use the exact text fallback.
2. **Project Intake** — collect one free-form input containing any mix of Idea, Thoughts, Plan, Research, Search notes, Assumptions, constraints, references, competitors, or rough notes.
3. **Discover → Research → Reason** — search the internet for possibilities and evidence, research the strongest findings deeply, and independently challenge assumptions.
4. **Market Compare → Deep Audit Existing Systems** — compare the concept against competitors, substitutes, category leaders, newer products, and relevant open-source systems; deeply audit the most useful comparable systems using credible available evidence.
5. **Synthesize → Plan** — create/revise the project plan from evidence, not merely from the user's original assumptions.
6. **System Design** — act as a System Design Engineer and design the complete system boundaries, actors, subsystems, integrations, non-functional requirements, reliability, scalability, security, privacy, observability, deployment environments, and extension points.
7. **Technology Recommendation + Consent** — compare the best-fit frontend, backend, database, infrastructure, testing, deployment, and supporting technologies for current and credible future needs. Before detailed implementation architecture or coding, request explicit consent using `Approve Technology Stack` as the preferred primary action and `Review Alternatives` where useful.
8. **Development Architecture** — after technology approval, act as a Senior Software / Structure Architecture Engineer and define repository structure, module boundaries, contracts, persistence, APIs, state, integrations, testing architecture, CI/CD, deployment topology, rollback strategy, and engineering conventions.
9. **Data Flow Design** — act as a Data Flow Engineer and design important end-to-end reads/writes, actors, APIs, stores, transformations, integrations, trust boundaries, failures, retries, retention, deletion, and audit paths.
10. **Professional UI/UX Design** — act as a Senior UI/UX Engineer / Product Designer and define information architecture, journeys, task flows, screens, states, responsive behavior, component system, accessibility, onboarding, and interaction behavior.
11. **Development + DevOps** — act as a Senior Developer and DevOps Engineer and implement the approved system incrementally with frontend, backend, persistence, integrations, tests, infrastructure, CI/CD, observability, deployment automation, recovery considerations, and synchronized documentation.
12. **SQA** — independently validate the system as an SQA Engineer using the relevant static, unit, integration, contract, E2E, regression, responsive, accessibility, performance, failure/retry, deployment, backup/restore, upgrade, and rollback tests.
13. **Security Engineering + Authorized Adversarial Assessment** — act as a Security Engineer and Ethical Hacker. White-hat, realistic hostile/black-hat-style, green-hat/novice, insider, and automated-abuse perspectives are defensive lenses only against explicitly authorized project scope.
14. **AI-Native Project Ownership** — the AI now treats the repository as an active engineering responsibility, not as disconnected prompts. It determines the next valid work itself when repository evidence is sufficient and no human decision blocks progress.
15. **Repository-Backed Memory Bank** — persistent project state tracks what is complete, partial, blocked, remaining, needs update, needs removal/deprecation, and where work must resume. Chat history is never the project source of truth.
16. **Pre-Plan + Options Bank + Modules Bank** — before large-scale implementation, maintain a living pre-plan, a reusable options/capabilities bank, and a canonical modules bank. Modules attach reusable capabilities by stable option IDs.
17. **Phase → Module → Small Work Unit Execution** — convert the project into outcome-oriented phases/milestones, modules, and small dependency-aware executable work units that are easy to implement, review, test, and complete without creating meaningless micro-task overhead.

## Repository-backed AI continuity

AI-native execution is defined in `AI-NATIVE-EXECUTION.md`.

Persistent core artifacts:

- `config/ai/project-state.json` — compact answer to where the project is now and where work resumes.
- `config/ai/options-bank.json` — reusable capability/option catalog.
- `config/ai/modules-bank.json` — canonical module catalog with attached option IDs.
- `config/ai/execution-plan.json` — dependency-aware phases, modules, and work-unit graph.
- `docs/ai/PRE-PLAN.md` — living engineering pre-plan and decomposition document.

Before new/resumed work, the AI reconciles these records against actual repository/Git/test reality. If recorded memory conflicts with verified repository reality, repository reality wins and the memory bank is repaired.

The target execution hierarchy is:

**Project → Phase/Milestone → Module → Work Unit → Acceptance/Verification**

A work unit should be a small coherent slice that can be understood, implemented, reviewed, tested, and completed reliably.

## AI-native execution loop

When development is authorized and no genuine human decision blocks progress, the AI repeatedly:

1. inspects repository reality
2. reconciles project memory/state
3. identifies the active phase/module/work unit
4. selects the next valid dependency-satisfied work unit
5. implements a small coherent slice
6. tests and verifies it
7. updates documentation and persistent state
8. identifies newly exposed work, updates, removals, risks, or decisions
9. continues

The AI should not ask which module to work on when repository evidence can determine the answer.

## Engineering rules

Security, quality, privacy, accessibility, observability, and operability are cross-cutting concerns from design onward.

Technology must be chosen from project-specific evidence rather than fashion or familiarity. Prefer the simplest architecture that safely satisfies validated needs, and do not introduce distributed-system complexity without justification.

Development includes adding, updating, migrating, deprecating, and removing artifacts. Deletion or replacement must be evidence-based and must account for dependencies, contracts, data migration, tests, user-visible behavior, and rollback implications.

Code existing is not equivalent to work being complete. A work unit is complete only when relevant implementation, tests, quality/security checks, documentation, acceptance criteria, and persistent project state are synchronized.

## Start prompt

Give the repository URL to an AI and say:

> Read this repository's AI instructions and initialize it.

The repository instructions define the rest of the interaction.

## Protocol files

- `AGENTS.md` — root agent contract and authority.
- `START-HERE.md` — intake, research, market audit, and planning flow.
- `DEVELOPMENT-LIFECYCLE.md` — system design through QA and authorized security hardening.
- `AI-NATIVE-EXECUTION.md` — persistent ownership, memory bank, pre-plan, options/modules banks, decomposition, and autonomous continuation.
