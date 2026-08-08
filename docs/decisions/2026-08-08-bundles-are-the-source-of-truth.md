# The built bundles are the source of truth, not the TypeScript source

**Date:** 2026-08-08
**Status:** Accepted

## Context

This repository contains two copies of LazyFrog:

- The unpacked extension at the repo root (`background.js`, `chunks/*.js`, `content-scripts/*.js`).
- A WXT + React + TypeScript source tree at `old source/LazyFrog/extension/`.

The root is genuinely a `wxt build` of that source: the Vite content-hashed chunk
names (`missions-D8fOGyOo.js`, `options-BYuZGLyR.js`, …) match the pristine
`0.16.1` release zip byte-for-byte in name, which cannot happen by accident.

But the source is stale as of the **November 2025** release. Since then roughly
**+460 KB / +11,600 lines** of behaviour has been hand-written directly into the
bundles and never ported back — about 64% the size of the entire source tree.
Marker audit: of ten distinctive identifiers from the current bundles
(`LazyFrog:RunGate`, `normalizeMissionPermalink`, `REFRESH_BOT_QUEUE`,
`lazyfrogBotQueueSnapshot`, `maybeHandleUnavailableMissionPage`, …) **seven exist
only in the bundles**.

`manifest.json` has diverged structurally too. It is hand-maintained and declares
things `wxt.config.ts` does not: the `webNavigation` permission, `localhost` /
`127.0.0.1` host permissions, `content-scripts/autosell.js`, and
`pageWorldKeepAlive.js` as a web-accessible resource.

Both `docs/plans/2026-05-29-bot-stability-reliability.md` and
`docs/changelogs/2026-07-05-mission-sync-queue-fixes.md` list only bundle files
as modified, and the 05-29 plan's own follow-up — "port changes to TypeScript
source before next release build" — was never done.

## Decision

**Treat the repo root as the codebase.** Refactor in place in the bundles.
Do not run `wxt build`.

The root is now under git (first commit `d216540`), which it was not before.

`old source/` is excluded from this repository's git via `.gitignore`, because it
is its own clone of `github.com/Saturate/LazyFrog`.

## Consequences

- `wxt build` would **revert eight months of work** and silently drop the
  manifest additions above. It must not be run without a deliberate port first.
- There is no type checking and no bundler. Shared code is therefore a plain
  classic script (`lib/missionCore.js`) attached to `globalThis`, loaded via
  `importScripts` in the service worker, the manifest `js` array in content
  scripts, and a `<script>` tag ahead of the module bundles in the HTML pages.
- Testing is plain `node --test` against dependency-free modules, plus a mocked
  service-worker harness, rather than the source tree's vitest suite (whose
  tests cover the November 2025 storage shape, not what the bundles write).
- `minify: false` in `wxt.config.ts` is what makes the bundles readable and
  hand-editable. That is load-bearing for this decision.

## Alternatives considered

**Port the bundles back to TypeScript, then build.** The correct long-term fix,
and the source tree *can* build — the `@lazyfrog/types` / `@lazyfrog/ui`
workspace packages do exist and `pnpm-workspace.yaml` resolves. But it is a port
project of ~11,600 lines with no git history to reconstruct intent from and no
test coverage on the new behaviour; `docs/` is the only specification of what
changed. Rejected as disproportionate to the task at hand, not as wrong.

If that port is ever attempted, two anchors exist: the pristine
`lazyfrog-0.16.1-chrome.zip` under `old source/LazyFrog/website/public/downloads/`
is an exact "before" baseline for a real diff, and the two docs above form a
21-item checklist of behaviour that must survive.
