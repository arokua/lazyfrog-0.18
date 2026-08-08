# Development Principles
Think Before Coding: Don't assume. Don't hide confusion. 
Surface tradeoffs and push back if a simpler approach exists.
Minimum Code: Write the minimum code that solves the problem. Nothing speculative or over-abstracted.
Touch Only What You Must: Make surgical edits. Clean up only your own mess without doing unrelated refactors or changing style.
Define Success Criteria: Specify exactly what completion looks like. Loop independently until the outcome is verified.
## Modify Before Creating

* Before creating a new function, class, component, service, hook, API endpoint, or utility, first analyze whether an existing implementation can be safely extended or refactored.
* Prefer enhancing existing functionality over introducing parallel implementations.
* Avoid duplicate logic, duplicate data flows, and duplicate abstractions.
* If a new implementation is necessary, explain why the existing implementation cannot be reasonably extended.

## Refactoring Requirements

* When implementing new features, actively identify opportunities to:

  * Reduce code duplication.
  * Consolidate similar functions.
  * Improve naming consistency.
  * Improve type safety.
  * Remove dead or obsolete code.
* Refactoring must not break existing functionality.
* Preserve backward compatibility unless explicitly instructed otherwise.

## Project Memory Policy

Do not use Cursor global memory, user memory, IDE memory, or any external/default memory location for this project.

Do not store project plans, decisions, task notes, implementation summaries, or architecture notes in:
- Cursor global memory
- Cursor user memory
- AppData / Roaming / Cursor storage
- External scratchpads outside this repository

All durable project knowledge must be written into files inside this repository.

Use these repository paths:
- `docs/plans/` for implementation plans
- `docs/decisions/` for architecture decisions
- `docs/tasks/` for task breakdowns
- `docs/notes/` for working notes
- `docs/changelog/` for completed changes

Before starting a task:
1. Read relevant files under `docs/`.
2. Check whether a plan or decision already exists.
3. Update the existing repository document instead of creating hidden memory.

After completing a task:
1. Update the relevant project document.
2. Summarize what changed.
3. Do not save the summary to Cursor memory.

* Never store project knowledge in Cursor's default memory system when a project repository is available.

* Store all project knowledge inside the repository.

* Place documentation in appropriate project directories such as:

  * `/docs/`
  * `/docs/plans/`
  * `/docs/decisions/`
  * `/docs/architecture/`
  * `/docs/tasks/`
  * `/docs/changelogs/`

* Runtime logs belong in `/Logs/` (see `Logs/README.md`). Start `node log-server.js` and enable
  `automationConfig.remoteLogging` so the extension streams to disk with indexed `.txt` / `.md` files.

* Create directories when needed.

* Update existing documentation before creating new documents covering the same topic.

## Planning Before Coding

* For non-trivial tasks:

  1. Analyze the existing architecture.
  2. Identify affected modules.
  3. Produce a brief implementation plan.
  4. Then begin coding.

* Avoid making architectural changes without documenting the rationale.

## Repository First

* Always inspect existing code before proposing new structures.
* Follow existing project conventions unless there is a strong reason not to.
* Match existing:

  * Naming conventions
  * Folder structures
  * Error handling patterns
  * State management patterns
  * Testing patterns

## Root Cause First

* When fixing bugs:

  * Identify the root cause before implementing fixes.
  * Avoid adding workaround layers unless explicitly requested.
  * Explain the root cause and the chosen solution.

## File Creation Policy

* Do not create files unnecessarily.
* Prefer updating existing files.
* New files should only be created when:

  * Separation of concerns improves.
  * Existing files become excessively large.
  * A genuinely new module is required.

## Dependency Policy

* Prefer existing project dependencies.
* Do not introduce new packages without justification.
* Before adding a dependency:

  * Check whether the functionality already exists in the codebase.
  * Check whether an existing dependency can solve the problem.

## Code Quality

* Write maintainable code over clever code.
* Favor readability over premature optimization.
* Minimize technical debt.
* Remove obsolete code related to replaced implementations.

## Documentation Synchronization

* When architecture, APIs, workflows, schemas, or business logic change:

  * Update relevant documentation in the same task.
  * Do not leave documentation outdated.

## Large Changes

* For large modifications:

  * Present a plan first.
  * Wait for approval if the change may affect multiple modules, schemas, APIs, or workflows.

## Output Expectations

When completing a task, provide:

1. What changed.
2. Why it changed.
3. Files modified.
4. Potential risks.
5. Follow-up recommendations.
