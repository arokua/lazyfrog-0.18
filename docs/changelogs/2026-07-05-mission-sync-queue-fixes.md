# Mission sync, queue refresh, and skip logic fixes (2026-07-05)

## Update (queue disconnect + flair parsing)

- **Refresh queue** now calls `REFRESH_BOT_QUEUE` in the background: recomputes the bot queue from storage + `automationFilters` (popup Bot filters), persists `lazyfrogBotQueueSnapshot`, broadcasts `BOT_QUEUE_UPDATED`. Does **not** Reddit-sync.
- Popup mission list (top 5) and START count read filters from storage via `getAutomationFilters()`, not stale local state.
- Options **Bot queue** view sorts by `queuePostIds` order (matches bot/popup).
- Background queue logic aligned with missions module: default max level 340, sort uses `postedAt`/`createdUtc`, shared snapshot on mission updates.
- Flair parsing accepts en-dashes, `Lv.` prefix, and `link_flair_richtext`; sync updates placeholders when real levels arrive.
- Missions dashboard **Bulk actions** card: mark selected or filtered missions **cleared** or **pending** (via `setMissionsClearedStatus`); refreshes bot queue after changes.
- **Bot start queue build**: check storage queue first (no blocking sync); scan subreddit tab (opens `/new` if needed); force Reddit sync only when still empty; 2 min starting timeout; placeholder flair backfill before giving up.
- **Subreddit proactive scan**: content script watches feed while bot runs; improved flair parsing for 260+ ranges.
- **Sync no longer stores trash as 1–999**: listing ingest requires level flair; 1-day search slices cover days 1–15 past the /new cap; auto-prune removes old unflaired placeholders after sync.
- **Mission-end queue advance**: `navigating` no longer blocks dialog close; `waitingForDialogClose` actively sends close; mid-run queue lookup skips Reddit sync; session flag keeps automation alive through state flicker.
- **Victory Play Next targeting**: footer row has Discover (left) + Play Next (right) both as `.end-mission-button`; bot now picks the rightmost / play-next sibling, clicks once, and keeps devvit clicking if queue state flickers during victory UI.

## Files modified

- `background.js`, `chunks/missions-D8fOGyOo.js`, `chunks/options-BYuZGLyR.js`, `chunks/popup-B6A5g-HE.js`, `content-scripts/reddit.js`, `content-scripts/devvit.js`
