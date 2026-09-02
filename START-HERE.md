# Start Here

This document defines the first project-start interaction.

## State A — Repository link received

When an AI is given this repository URL, it must first inspect the repository and read the root instructions.

If no completed project intake exists, the AI should not immediately produce architecture or code. It should offer a single primary action:

**Start Development**

Preferred UI when supported by the host:

- Primary button/action: `Start Development`

Fallback when the host does not support custom buttons:

- Ask the user to reply: `Start Development`

## State B — Start Development activated

Present one large free-form intake field when supported, labeled:

**Idea / Thoughts / Plan / Research / Search / Assumptions**

Prompt text:

> Add everything you currently have about the project in one place. This can be a raw idea, incomplete thoughts, an existing plan, research, links, search notes, assumptions, desired features, constraints, references, competitors, technical preferences, or uncertainties. It does not need to be organized.

Fallback when the host has no custom text-area UI:

> Paste your Idea / Thoughts / Plan / Research / Search / Assumptions in one message. It can be completely unstructured.

Do not force the user through multiple required fields.

## State C — Intake received

Persist or update the normalized project intake in `PROJECT-IDEA.md` when repository write access is available.

Then execute the following sequence before development:

### 1. Understand

Extract and distinguish:

- explicit requirements
- facts
- assumptions
- preferences
- constraints
- open questions
- risks
- references
- existing decisions

### 2. Search the internet for possibilities

When web/search capability is available, proactively investigate the project domain. Search for:

- existing solutions and competitors
- comparable products
- relevant workflows and user expectations
- current technologies and implementation approaches
- APIs, platforms, libraries, standards, and integrations
- technical, operational, regulatory, security, privacy, or accessibility constraints where relevant
- pricing/business-model patterns where relevant
- known failure modes and common mistakes
- opportunities or approaches not mentioned by the user

The purpose is discovery, not confirmation of the user's assumptions.

### 3. Research the strongest possibilities

Deepen the most relevant findings. Prefer current, primary, authoritative, or technically credible sources where possible.

Compare alternatives and note trade-offs. Do not treat search snippets or a single source as sufficient research for an important decision.

### 4. Reason independently

After research, synthesize what was learned and think beyond the initial prompt.

The AI should:

- test the user's assumptions against evidence
- identify missing pieces
- identify contradictions
- identify hidden dependencies
- consider simpler or stronger alternatives
- identify feasibility and scope risks
- separate must-haves from optional ideas
- mark unresolved uncertainty explicitly

### 5. Compare the user's concept with the current market

Before producing the project plan, compare the normalized user concept against relevant current market offerings and patterns.

The comparison should examine, where applicable:

- direct competitors
- indirect competitors and substitutes
- mature category leaders
- newer or fast-growing products
- open-source alternatives
- common feature sets
- user journeys and workflows
- positioning and differentiation
- pricing and monetization patterns
- onboarding and activation models
- integrations and ecosystem expectations
- platform coverage
- trust, privacy, security, compliance, and accessibility expectations
- operational models
- known customer complaints, weaknesses, and gaps
- opportunities the user's concept could exploit

Do not assume that copying the market is desirable. The goal is to understand what already exists, what users are accustomed to, where existing systems are strong, and where meaningful gaps remain.

Explicitly identify:

- where the user's idea is stronger
- where it is weaker
- where it is undifferentiated
- where assumptions conflict with market evidence
- missing capabilities that appear important
- unnecessary capabilities that add complexity without clear value
- possible differentiators worth preserving or developing

### 6. Analyze and deeply audit comparable systems

Select the most relevant existing systems discovered during research and market comparison, then study them in greater depth using the evidence available.

For each important comparable system, audit as much as can be responsibly established, including:

- product scope and target users
- core jobs-to-be-done
- feature architecture
- information architecture and navigation
- major user flows
- onboarding
- permissions and roles
- collaboration model
- automation model
- integrations
- pricing or business model
- platform and deployment model where observable
- API or developer ecosystem where relevant
- data handling, privacy, security, compliance, and trust signals where observable
- performance, reliability, scalability, or operational characteristics where credible evidence exists
- user feedback, recurring complaints, limitations, and failure patterns
- strengths worth learning from
- weaknesses or gaps worth avoiding
- architectural or product decisions that appear reusable

Distinguish clearly between:

- directly verified evidence
- reasonable inference
- unknown or inaccessible implementation details

Never fabricate private architecture, internal code, proprietary metrics, or undocumented behavior. A deep audit means rigorous analysis of available evidence, not pretending to have access to information that is not public.

The objective is to learn from prior systems rather than blindly reproduce them.

### 7. Synthesize findings and plan

Only after discovery, research, independent reasoning, market comparison, and comparable-system audits should the AI create the project plan.

The plan must incorporate what was learned rather than merely restating the user's original input.

It should be grounded in:

- the user's actual intent
- normalized intake
- repository reality
- external evidence
- market comparison
- lessons from audited comparable systems
- technical feasibility
- identified risks and constraints
- opportunities and gaps discovered during research

The AI should explicitly revise, remove, add, or reprioritize proposed capabilities when the evidence justifies doing so, while preserving genuine user constraints and decisions.

The planning output should distinguish at minimum:

- validated requirements
- assumptions still requiring validation
- recommended additions
- recommended removals or simplifications
- competitive or market-driven requirements
- differentiators
- risks
- unresolved decisions
- phased implementation priorities

This repository currently stops at defining this pre-development planning flow. Later stages will extend this protocol into full AI-native implementation and delivery.
