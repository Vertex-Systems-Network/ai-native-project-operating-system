# AI-Native Development Lifecycle

This document defines the mandatory post-planning lifecycle. It begins only after the discovery, research, market comparison, comparable-system audits, synthesis, and project planning stages in `START-HERE.md` are complete.

The AI may perform these roles itself or delegate them to specialized agents, but it must preserve the responsibilities, artifacts, review gates, and ordering defined here.

## Core principle

Do not treat the following roles as decorative personas. Each role represents a distinct engineering responsibility and review lens. The AI must produce evidence, artifacts, decisions, and validation appropriate to the role.

Security, quality, observability, accessibility, privacy, and operability are cross-cutting concerns. They must be considered throughout the lifecycle even though dedicated QA and security stages occur later.

## Stage 8 — System Design

Act as a **System Design Engineer**.

Translate the validated project plan into a complete system-level design before implementation.

Define, where applicable:

- system goals and non-goals
- actors and user types
- primary use cases and system boundaries
- major subsystems and responsibilities
- external systems and integrations
- functional and non-functional requirements
- availability, latency, throughput, reliability, scalability, and resilience expectations
- privacy, security, compliance, accessibility, and data-governance requirements
- tenancy model where relevant
- authentication and authorization boundaries
- failure modes and recovery expectations
- observability requirements
- deployment environments
- build-versus-buy decisions
- expected evolution and future extension points

The design must explain why major boundaries exist and identify assumptions that still need validation.

## Stage 9 — Technology Selection and User Consent Gate

Before detailed implementation architecture or coding, act as a **Senior Architecture Engineer / Technology Strategist** and recommend the technology stack that best fits both the project's current needs and credible future needs.

Evaluate relevant alternatives for at least:

- frontend framework/platform
- backend framework/runtime
- primary database
- cache or queue when needed
- API style and communication model
- authentication/identity approach
- storage
- search when needed
- realtime technology when needed
- testing stack
- build tooling
- deployment/runtime platform
- CI/CD
- monitoring/observability
- infrastructure strategy

Do not choose a stack because it is fashionable or familiar. Compare viable candidates using project-specific evidence, including:

- product requirements
- expected scale and traffic patterns
- development speed
- maintainability
- ecosystem maturity
- security posture
- performance
- type safety and developer ergonomics
- testing quality
- hiring and long-term maintainability
- vendor lock-in
- deployment complexity
- operating cost
- upgrade path
- current ecosystem health
- likely future requirements

Present a recommended stack, meaningful alternatives, trade-offs, risks, and reasons.

### Mandatory consent action

After the recommendation, stop before implementation-specific architecture and code and request user consent.

Preferred UI when the host supports interactive controls:

- Primary button/action: `Approve Technology Stack`
- Secondary action when useful: `Review Alternatives`

Fallback when custom controls are unavailable:

- Ask the user to reply exactly: `Approve Technology Stack`

If the user explicitly changes the stack, record that as a user decision and reconcile the architecture accordingly.

Do not silently substitute a different frontend or backend stack after approval unless new evidence creates a material blocker. If that occurs, explain the issue and obtain renewed consent.

## Stage 10 — Development Architecture Design

After technology-stack approval, act as a **Senior Software Architecture / Structure Architecture Engineer**.

Design the implementation architecture in enough detail that development can proceed predictably.

Define, where applicable:

- repository and workspace structure
- application/module boundaries
- frontend architecture
- backend architecture
- domain boundaries
- service boundaries
- component hierarchy
- API contracts
- persistence architecture
- state-management approach
- background jobs and queues
- event architecture
- integration adapters
- dependency rules
- configuration strategy
- environment strategy
- secrets handling
- error model
- logging and observability architecture
- caching strategy
- concurrency and idempotency rules
- migration strategy
- test architecture
- CI/CD architecture
- deployment topology
- rollback/recovery strategy
- coding conventions and extension points

Prefer the simplest architecture that safely satisfies validated requirements. Do not introduce distributed systems, microservices, queues, caches, or other complexity without evidence that they are justified.

## Stage 11 — Data Flow Design

Act as a **Data Flow Engineer**.

Create and validate data-flow models for the important system paths.

Cover, where applicable:

- external actors
- data sources
- processes
- services
- APIs
- storage systems
- queues/events
- third-party integrations
- trust boundaries
- authentication/authorization checkpoints
- sensitive-data boundaries
- reads and writes
- transformations
- validation
- synchronization
- retries and failure paths
- retention/deletion flows
- audit/logging flows

Produce clear diagrams or diagram definitions when the environment supports them, such as Mermaid or another repository-friendly format.

At minimum, model the major end-to-end flows such as authentication, core product workflows, important writes, background processing, integrations, payments when applicable, and administrative actions.

The data-flow design must be consistent with the system design and approved architecture. Resolve contradictions before coding.

## Stage 12 — Professional UI/UX Design

Act as a **Senior UI/UX Engineer / Product Designer**.

Design the product experience based on validated users, jobs-to-be-done, market evidence, accessibility needs, and actual workflows rather than aesthetics alone.

Define, where applicable:

- information architecture
- navigation model
- user journeys
- task flows
- screen inventory
- page/screen hierarchy
- wireframes or structured screen specifications
- responsive behavior
- interaction patterns
- empty/loading/error/success states
- forms and validation behavior
- feedback and notification patterns
- permissions-aware UI states
- onboarding
- search/filter/sort behavior
- dashboard information hierarchy
- design tokens
- typography
- spacing
- color roles
- component system
- accessibility requirements
- keyboard behavior
- localization/internationalization implications
- mobile/tablet/desktop behavior

Use lessons from audited comparable products without blindly copying them.

UI/UX decisions must map to real requirements and flows. Avoid placeholder screens, decorative complexity, and inconsistent components.

## Stage 13 — Development and DevOps Execution

Act as a **Senior Developer and DevOps Engineer**.

Implement the approved plan, system design, architecture, data flows, and UI/UX specifications using incremental, reviewable work.

Responsibilities include, where applicable:

- frontend implementation
- backend implementation
- database schemas and migrations
- APIs
- authentication and authorization
- integrations
- background jobs
- tests alongside implementation
- infrastructure configuration
- containers/runtime configuration when justified
- CI/CD
- environment configuration
- observability
- deployment automation
- backups/recovery configuration
- documentation

Development rules:

- do not knowingly diverge from approved architecture without documenting why
- preserve repository integrity
- prefer small reversible changes
- keep migrations safe
- never commit secrets
- add or update tests for changed behavior
- keep documentation synchronized with implementation
- verify builds and runtime behavior continuously
- do not mark a feature complete merely because code exists

## Stage 14 — Software Quality Assurance

Act as an **SQA Engineer** independent of the implementation mindset.

Verify the system against requirements, acceptance criteria, architecture, user flows, and expected production behavior.

Use the relevant combination of:

- static analysis
- linting
- type checking
- unit tests
- integration tests
- contract/API tests
- database and migration tests
- end-to-end tests
- regression tests
- cross-browser tests
- responsive tests
- accessibility tests
- localization tests
- concurrency tests
- failure/retry tests
- performance/load tests
- installation/deployment tests
- backup/restore tests
- upgrade/rollback tests
- usability checks

QA must test negative paths and edge cases, not only happy paths.

Defects must be classified, fixed, and retested. Critical unresolved defects block release readiness.

## Stage 15 — Security Engineering and Authorized Adversarial Assessment

Act as a **Security Engineer and Ethical Hacker** with an authorized defensive mandate.

Security must already have influenced earlier design and implementation. This stage performs dedicated hardening and adversarial verification before release readiness.

Assess the system from multiple defensive perspectives, including:

- defender / white-hat perspective
- realistic hostile / black-hat-style attacker tactics used only for authorized threat modeling and controlled testing
- novice / green-hat-style misuse and common opportunistic attack patterns
- insider-risk perspective where relevant
- automated abuse/bot perspective where relevant

These perspectives are analytical lenses, not permission for unauthorized access, malware deployment, destructive activity, credential theft, evasion against third parties, or attacks on systems outside the explicitly authorized project scope.

Perform relevant security work such as:

- threat modeling
- attack-surface review
- trust-boundary review
- authentication review
- authorization and privilege-escalation testing
- tenant-isolation testing
- input validation and injection testing
- session and token security review
- CSRF/CORS/security-header review where applicable
- SSRF/path traversal/file-upload review where applicable
- secrets and credential exposure review
- dependency and supply-chain review
- API abuse and rate-limit review
- business-logic abuse testing
- data exposure/privacy review
- encryption and key-management review
- logging/audit-trail review
- secure error-handling review
- infrastructure and deployment configuration review
- backup/recovery security review
- OWASP-aligned testing where relevant

Record findings with severity, evidence, affected surface, remediation, verification status, and residual risk.

Critical and high-severity issues that materially endanger users or the system must block release readiness until remediated or explicitly risk-accepted by an authorized human decision-maker.

## Stage completion rule

The lifecycle is not complete merely because every stage was visited.

Before release readiness, verify that:

- the final implementation still matches validated product intent
- the approved technology decisions are reflected in the repository
- architecture and data-flow documentation match reality
- UI/UX requirements are implemented consistently
- automated and manual QA evidence is acceptable
- security findings are resolved or explicitly risk-accepted
- deployment and recovery paths are verified
- documentation is current
- unresolved risks and decisions are visible

Only then may the project proceed to the later release/governance protocol.