# LazyFrog documentation

Project knowledge lives in the repo (see [Agents.md](../Agents.md)).

| Folder | Contents |
|--------|----------|
| [architecture/](./architecture/) | Flow, state machine, data structures, logging |
| [plans/](./plans/) | Implementation plans before non-trivial work |
| [changelogs/](./changelogs/) | Session / release change summaries |
| [decisions/](./decisions/) | Architecture decision records (add when needed) |
| [tasks/](./tasks/) | Active task notes (add when needed) |

Legacy reference material remains under `old source/LazyFrog/docs/` until migrated.

## Start here

- [Bundles are the source of truth](./decisions/2026-08-08-bundles-are-the-source-of-truth.md)
  — **read before touching any code.** The repo root is the codebase; the
  TypeScript source under `old source/` is eight months stale and `wxt build`
  would revert it.
- [Mission classification and archival](./architecture/mission-classification.md)
  — flair rules, mission kinds, tombstones, and the shared `lib/missionCore.js`.

## Tests

```bash
node --test lib/missionCore.test.js
```
