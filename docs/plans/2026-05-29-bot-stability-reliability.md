# Plan: bot stability and reliability (2026-05-29)

## Goals

- Stop missions getting stuck (inn loop, victory_end timeout, deleted posts).
- Prevent wrongful full-page reload while game modal/iframe is active.
- Make debugging reproducible via persisted logs on disk.

## Affected modules

| Area | Files |
|------|-------|
| Reddit content script | `content-scripts/reddit.js` |
| Background SW | `background.js` |
| Devvit iframe | `content-scripts/devvit.js`, `pageWorldKeepAlive.js` |
| Options UI | `chunks/options-BYuZGLyR.js` |

## Work completed

1. **Run gate / console noise** — Settings toggle for `[LF]`, `[LazyFrog:RunGate]`, `[LazyFrog:StartFlow]` (default off).
2. **Inn vs Start** — `mc__btn-inn` / `mc__btn-start` mutual exclusion; only open iframe when start UI exists.
3. **Navigation guard** — `isGameSessionProtected`, `canNavigateAway`, block `tabs.update` during active game.
4. **Slug-safe permalink** — `normalizeMissionPermalink` preserves full URL to avoid reload after Start.
5. **Page reload tracing** — `[LazyFrog:PageReload]` + `lazyfrogPageReloadLog` ring buffer in `chrome.storage`.
6. **Modal forced close** — Removed synthetic `visibilitychange` from keepalive; defer keepalive when modal open.
7. **Deleted / unavailable missions** — `isPostDeleted`, `maybeHandleUnavailableMissionPage` → `MISSION_DELETED`.
8. **Mission dashboard** — Pagination 10–50 (step 5), sort by level range.
9. **File logging** — `log-server.js` + `Logs/` indexed `.txt` / `.md` output.

## Risks

- Bundled `chunks/*.js` edits are overwritten on the next extension build from source.
- Remote logging requires `node log-server.js` and `remoteLogging: true`.

## Follow-up

- Port changes to TypeScript source under `old source/LazyFrog/extension/` before next release build.
- Consider defaulting `remoteLogging` on when localhost:7856 responds.
