# AI-Native Code Quality System

Code quality is a merge gate and planning concern for **child projects created from this template**. The canonical template source stores the policy and inactive blueprints; it does not represent those project checks as already applied to itself.

The machine-readable blueprint is `config/quality/quality-policy.json`.

## Source template boundary

On `Vertex-Systems-Network/ai-native-project-operating-system`:

- files under `blueprints/github/` are reusable inactive project blueprints;
- absence/presence of a blueprint is not evidence that a live GitHub check is enabled;
- child-project quality workflows must not be treated as active on the canonical source.

## Universal child-project baseline

During child bootstrap, `scripts/bootstrap_instance.py` installs the universal baseline into the child's active `.github/` paths. Baseline capabilities include:

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
3. **CodeQL baseline**
   - provides the project security-analysis baseline supported by the repository/workflow context.
4. **OpenSSF Scorecard**
   - evaluates repository/supply-chain security posture where supported.
5. **Dependabot**
   - proposes supported dependency/workflow updates.

The AI must verify actual successful child-project checks before referring to them as active or using their names in GitHub Rules.

## Stack-adaptive checks

After `Approve Technology Stack`, the Architecture/SQA/Supervisor roles automatically select mature ecosystem-standard tooling for the actual stack and add CI checks before normal feature development scales up.

At minimum, the selected stack should have, where the ecosystem supports them:

- deterministic formatting;
- linting;
- type checking or equivalent static analysis;
- unit testing;
- integration testing;
- build/package verification;
- dependency vulnerability audit;
- security scanning.

When relevant, also add contract/API tests, E2E tests, accessibility, performance/load, migration, container, infrastructure-as-code, license, and code-coverage gates.

Normal non-destructive quality tooling does not require a separate generic approval. If setup requires paid services, secrets, repository-admin changes, destructive migrations, or another material commitment, obtain the applicable user approval/access first.

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

An AI code-review service such as CodeRabbit can be added as a complementary reviewer when the child project's environment/account can actually run or attach it. It does not replace deterministic lint/test/security gates or independent review for high-risk changes.

## Definition of done

A module/work unit is not complete because code exists. Required installed quality checks must pass, relevant tests must cover the behavior, known critical/high security issues must be resolved, documentation/state must agree with reality, and the Supervisor must accept the integration.
