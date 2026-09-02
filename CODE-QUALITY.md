# AI-Native Code Quality System

Code quality is a merge gate and a planning concern, not a cleanup phase.

The machine-readable policy is `config/quality/quality-policy.json`.

## Universal template checks

These apply before an application stack is known:

1. **AI Native Quality Gates**
   - validates repository-backed JSON state;
   - validates phase/module/work-unit/slot references;
   - detects duplicate stable IDs;
   - validates workflow safety invariants;
   - requires third-party GitHub Actions to be pinned to full commit SHAs;
   - validates YAML syntax and machine-file whitespace.
2. **Dependency Review**
   - evaluates dependency changes introduced by pull requests;
   - blocks high-severity vulnerable dependency additions.
3. **CodeQL for GitHub Actions**
   - analyzes workflow code using CodeQL `actions` language queries.
4. **OpenSSF Scorecard**
   - periodically evaluates repository/supply-chain security posture.
5. **Dependabot for GitHub Actions**
   - proposes updates to pinned workflow dependencies.

## Stack-adaptive checks

After `Approve Technology Stack`, the Architecture/SQA/Supervisor roles must select mature ecosystem-standard tooling for the actual stack and add CI checks before normal feature development scales up.

At minimum, the selected stack must have:

- deterministic formatting;
- linting;
- type checking or equivalent static analysis where the ecosystem supports it;
- unit testing;
- integration testing;
- build/package verification;
- dependency vulnerability audit;
- security scanning.

When relevant, also add contract/API tests, E2E tests, accessibility, performance/load, migration, container, infrastructure-as-code, license, and code-coverage gates.

## Tool selection criteria

Do not select a tool merely because it is popular. Compare:

- ecosystem fit and framework awareness;
- active maintenance and release health;
- false-positive/noise profile;
- CI performance;
- autofix support;
- machine-readable output/SARIF support;
- editor/developer integration;
- monorepo support;
- security track record;
- license and operating cost;
- compatibility with the project's supported runtime versions.

Record material tool decisions and why they were selected.

## AI review layer

An AI code-review service such as CodeRabbit can be added as a complementary reviewer when the current environment/account can actually run or attach it. It does not replace deterministic lint/test/security gates or independent review for high-risk changes.

## Definition of done

A module/work unit is not complete because code exists. Required quality checks must pass, relevant tests must cover the behavior, known critical/high security issues must be resolved, documentation/state must agree with reality, and the Supervisor must accept the integration.
