# Mission classification and archival — 2026-08-08

## Added

- **`lib/missionCore.js`** — shared flair parsing, mission classification,
  archival and queue gating, loaded in all five extension contexts. See
  [mission-classification.md](../architecture/mission-classification.md).
- **Flair classification.** No flair (past a 24h grace window) and `Cloak` are
  not missions; `Daily Dungeon` is a mission of its own kind, excluded from the
  bot queue unless "Bot plays Daily Dungeons" is enabled.
- **`flairText` and `missionKind` on mission records.** Previously the flair was
  parsed for levels and discarded.
- **Tombstone archival.** Missions past Reddit's ~30 day archive window collapse
  to `{postId, postedAt, createdUtc, archived: true}` — 2328 → 85 bytes on a
  representative record. The record is kept, so cleared history survives.
- **`RECLASSIFY_MISSIONS`** ("Classify Missions by Flair") — one-off backfill of
  `flairText` / `missionKind` onto existing records, in batches of 100.
- **`ARCHIVE_OLD_MISSIONS`** ("Archive Old Missions") — manual archival trigger.
- **Version control.** The built root is now a git repository; it had none.
  Google OAuth client/token files under `scripts/` are excluded as secrets.
- Unit tests (`lib/missionCore.test.js`, `node --test`) and a mocked
  service-worker integration harness.

## Fixed

- **Prune deleted fresh posts instead of stale ones.** The age comparison in
  `pruneUnflairedJunkMissionsFromStorage` and its twin in `chunks/missions-*.js`
  was inverted: it kept placeholders older than the cutoff and deleted ones
  within it, then wrote them into `nonMissionPosts` permanently. A post merely
  waiting on a moderator to apply flair was deleted and blacklisted. Daily
  Dungeons — which carry no level flair by design and so always look like
  placeholders — would have been destroyed wholesale by this.
- **Archive cleanup destroyed cleared history.** `cleanupArchivedMissions`
  deleted the mission record and then called `pruneUserProgressPostIds` on it,
  stripping `cleared`/`disabled`/`clearedAt`/`loot` for every archived mission.
  It now writes tombstones and leaves progress alone.
- **Enriching a mission dropped its post date.** `saveMissionToDatabase` in
  `content-scripts/devvit.js` rebuilds the record from scratch and `saveMission`
  overwrites wholesale, so `postedAt` and `createdUtc` — the fields the archive
  and queue-age rules read — were silently lost on every devvit enrich.
- **Feed-scanned Daily Dungeons were dropped.** `saveScannedMission` returned
  early unless a post had a level range.
- **Level ranges parsed without bounds in `reddit.js`.** Its copy of the parser
  lacked the `MISSION_LEVEL_MAX` and `minLevel >= 1` checks the background copy
  had, so a title like "2019-2024" parsed as a level range.
- **`deleteMissions` reported double.** Missions stored under both a `t3_` and a
  legacy short key incremented the counter twice.
- **New missions never arrived while the queue was non-empty.** The queue was
  only refreshed from Reddit once it ran completely dry. Bot start now runs the
  freshness sync, bounded by a 20s budget.

## Changed

- `getFilteredUnclearedMissions` in all three copies (background, reddit,
  missions chunk) now applies the same kind and tombstone gating.
- Eight duplicated helpers removed from `background.js` and four from
  `content-scripts/reddit.js` in favour of the shared core.

## Known gaps

- The `Cloak` and `Daily Dungeon` flair patterns were written from the reported
  flair names; live flair strings could not be fetched from this environment to
  confirm exact spelling. Both are single regexes in `lib/missionCore.js`.
- `content-scripts/devvit.js` still has its own copies of
  `normalizeMissionRecord`, `migrateLegacyRecord` and `getAllMissions`, and
  `background.js` still carries three different default max-level values
  (340 / 1200 / 340). Not touched in this pass.
- `chunks/missions-*.js` and `background.js` still hold separate
  `/api/info.json` batch fetchers.

## Files modified

`background.js`, `content-scripts/reddit.js`, `content-scripts/devvit.js`,
`chunks/missions-D8fOGyOo.js`, `chunks/options-BYuZGLyR.js`, `manifest.json`,
`options.html`, `popup.html`; added `lib/missionCore.js`,
`lib/missionCore.test.js`, `.gitignore`, `.gitattributes`.
