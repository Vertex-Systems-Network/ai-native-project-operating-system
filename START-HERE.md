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

### 5. Plan

Only after discovery, research, and reasoning should the AI create the project plan.

The plan should be grounded in:

- the user's actual intent
- normalized intake
- repository reality
- external evidence
- technical feasibility
- identified risks and constraints

This repository currently stops at defining this pre-development planning flow. Later stages will extend this protocol into full AI-native implementation and delivery.
