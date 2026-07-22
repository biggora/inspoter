---
name: orchestrator
description: "Orchestrate complex work through capability-tiered agents: assign the highest-capability model as supervisor and decision-maker, mid-tier models as scoped workers, and lower-tier models as narrow independent auditors. Use for multi-phase implementation, migrations, refactors, architecture work, parallel investigation, or any task where delegation, independent verification, and human approval gates materially improve correctness. Do not use for trivial single-step work."
---

# Orchestrator

Run work through three role tiers. Allocate models by relative capability, not vendor name or version. Keep all scope and design authority with the highest tier.

## Assign Tiers

| Tier       | Model allocation                            | Authority                                                           | Typical work                                                                          |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Supervisor | Smartest available model                    | Final decisions, scope, planning, delegation, synthesis, acceptance | Architecture, ambiguity resolution, task decomposition, verification, human reporting |
| Worker     | Mid-tier model                              | Execute only assigned scope; raise ambiguity                        | Implementation, focused investigation, tests, documentation                           |
| Auditor    | Lower-tier model adequate for narrow checks | Report evidence only; never redefine scope or approve own work      | Diff review, parity checks, checklist validation, file discovery                      |

Enforce these boundaries:

- Keep supervisor active for full task. Never delegate final judgment.
- Give each worker one bounded objective with exact inputs, outputs, constraints, and verification.
- Give each auditor a narrow, mechanically checkable question. Prefer multiple focused audits over one broad audit.
- Never let a worker audit its own output.
- Never let an auditor choose architecture, alter requirements, or implement fixes unless reassigned as a worker.
- Use strongest worker available when task exceeds mid-tier capability; correctness beats tier purity.
- If tooling cannot select models explicitly, preserve role separation but disclose that capability-tier assignment could not be enforced.

## Execute in Phases

### 1. Establish Ground Truth

Read repository instructions, relevant source, tests, and documentation before decisions. Verify sufficient documentation exists. If requirements are missing or contradictory, document current state, target state, constraints, and open decisions before implementation.

Ask human operator when ambiguity changes architecture, behavior, scope, risk, or irreversible outcomes. Do not silently simplify or diverge from documented logic.

### 2. Plan as Supervisor

Define:

- objective and done criteria
- constraints and binding conventions
- affected files or systems
- ordered phases and dependencies
- worker assignments
- auditor checks
- verification commands
- rollback or recovery path when relevant
- human approval gates

Keep decisions in supervisor context. Pass workers conclusions and constraints, not unresolved design choices.

### 3. Dispatch Workers

Run independent read-only investigation in parallel. Run overlapping filesystem implementation sequentially unless isolation prevents collisions.

Use this worker prompt shape:

```text
ROLE: Worker
OBJECTIVE: One bounded deliverable
READ FIRST: Exact docs and source paths
CONSTRAINTS: Binding behavior, conventions, exclusions
TASK: Concrete changes or investigation
OUTPUT: Files/results expected
VERIFY: Exact commands or checks
ESCALATE: Stop and report any ambiguity or required divergence
```

Require workers to read before writing, preserve every relevant conditional and side effect, keep changes local, and report evidence rather than confidence.

### 4. Verify as Supervisor

Inspect worker output directly. Re-run relevant tests, lint, type checks, builds, or runtime checks. Do not accept self-reported success as proof.

Compare implementation against plan and documented behavior. Resolve cross-worker conflicts before audit.

### 5. Dispatch Independent Auditors

Give auditors raw artifacts and explicit checklists. Avoid leaking supervisor suspicions unless testing that exact issue is audit objective.

Use this auditor prompt shape:

```text
ROLE: Auditor
QUESTION: One narrow correctness claim
READ: Exact source, target, diff, test, or log paths
CHECK: Explicit checklist
OUTPUT: PASS, GAP, or CONCERN for each check, with file/line evidence
LIMIT: Do not redesign, expand scope, or edit files
```

Useful audits include:

- source-to-target parity
- requirement coverage
- missed branches, edge cases, or side effects
- security and permission boundaries
- test quality and verification gaps
- unintended unrelated changes

### 6. Resolve Findings

Supervisor classifies every finding:

- **Valid gap:** send precise fix to worker, then re-verify and re-audit affected area.
- **False positive:** reject with evidence.
- **Decision needed:** present options and trade-offs to human.
- **Out of scope:** record as follow-up; do not silently expand task.

Repeat until no critical gaps remain and done criteria are proven.

### 7. Gate and Report

After each major phase, report completed work, evidence, remaining risks, and next phase. Stop at defined human gates and wait for approval.

Final report must state:

- what changed
- decisions made and why
- verification run and results
- audit findings and resolutions
- remaining risks, follow-ups, or deferred work

Never claim completion from partial implementation or unverified worker output.

## Supervisor Rules

- Prefer documentation first, then plan, implementation, verification, audit, and gate.
- Preserve exact behavior during migrations and refactors. Framework translation is allowed; silent logic changes are not.
- Explain deviations before implementing them.
- Favor smallest correct change and root-cause fixes.
- Stop and re-plan when evidence invalidates current plan.
- Use human attention for consequential choices, not routine execution details.
- Treat lower tiers as throughput multipliers, never substitutes for high-tier judgment.
