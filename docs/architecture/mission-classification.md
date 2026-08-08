# Mission classification, archival and the shared core

All flair parsing, mission classification, archival and queue-eligibility rules
live in **`lib/missionCore.js`**, exposed as `globalThis.LazyFrogMissionCore`.

## Why a shared classic script

The five contexts that need these rules cannot share an ES module:

| Context | Loads the core via |
|---|---|
| Service worker (`background.js`) | `importScripts("/lib/missionCore.js")` at the top of the file |
| Reddit content script | first entry of the `js` array in `manifest.json` |
| Options page (`chunks/options-*.js`, `chunks/missions-*.js`) | `<script src="/lib/missionCore.js">` in `options.html`, before the module bundle |
| Popup (`chunks/popup-*.js`) | same, in `popup.html` |

Classic scripts run before deferred module scripts, and content scripts in one
`js` array share the isolated world's global scope, so a single classic script
assigning to `globalThis` reaches all of them. Keep `lib/missionCore.js`
**dependency-free and DOM-free** so it runs unchanged everywhere.

`content-scripts/devvit.js` does not load the core — it has no use for it yet.

Before this existed, level-range parsing alone had **four independent
implementations with different regexes**, so the same flair could yield
different levels depending on which context read it. `normalizeMissionRecord`
had four copies, `getFilteredUnclearedMissions` three.

## Classification rules

`classifyMission({ flairText, title, postedAt, now })` returns a
`MissionKind` plus the reason:

| Kind | When | In the bot queue? |
|---|---|---|
| `mission` | Any flair that is not Cloak or Daily Dungeon | Yes |
| `dailyDungeon` | Flair matches `/\bdaily\s*dungeons?\b/i` | **Only if `filters.includeDailyDungeon`** |
| `notMission` | Flair matches `/\bcloaks?\b/i`; or a meta title (megathread, weekly thread, …); or unflaired and older than the grace window | Never |
| `unknown` | Unflaired but still inside the grace window | No, but kept in storage |

Two rules deserve explanation.

**The 24h flair grace window (`FLAIR_GRACE_MS`).** Moderators routinely flair a
post minutes to hours after it is submitted. An unflaired post is therefore
`unknown` — kept, and retried by the flair backfill — and only becomes
`notMission` once it has had a full day to acquire one. A post with no known
date is never condemned.

**Daily Dungeons are excluded by default.** They are real missions, but the game
runs them in a separate Phaser scene (`DailyDungeon`, see the scene list in the
game bundle) which the standard mission automation does not drive. The opt-in is
`filters.includeDailyDungeon`, surfaced as "Bot plays Daily Dungeons" in the
options mission filters.

A Daily Dungeon carries **no level range in its flair**, so it looks exactly like
an unflaired placeholder (`1-999`) to any rule that only inspects levels. Every
prune path must therefore check the kind first — see below.

## Record fields

`mapRedditPostToMission` now persists the flair it reads. Previously it parsed
flair for levels and threw the text away, which made all of the above
impossible to express.

| Field | Meaning |
|---|---|
| `flairText` | Raw flair as read from `link_flair_text` or `link_flair_richtext` |
| `missionKind` | One of the kinds above. **Absent means `mission`**, so pre-existing records stay playable |
| `archived` | `true` on a tombstone (see below) |

Run **Classify Missions by Flair** in options once to backfill `flairText` and
`missionKind` onto records saved before this existed (`RECLASSIFY_MISSIONS`).
It re-fetches flair in batches of 100 via `/api/info.json`, skips
already-classified records and tombstones, and is safe to re-run.

## Archival

Reddit archives posts ~30 days after posting, at which point they can never be
played. `archiveOldMissions()` collapses those records to a **tombstone**:

```js
{ postId: "t3_abc", archived: true, postedAt: 1700000000000, createdUtc: 1700000000 }
```

Everything else — encounters, images, environment, title — is dropped. On a
representative record that is 2328 → 85 bytes.

The record is **kept rather than deleted** for two reasons: cleared history in
`userProgress` stays meaningful, and sync will not re-add the post later. The
previous `cleanupArchivedMissions` deleted the record and then called
`pruneUserProgressPostIds` on it, destroying the completion history for every
archived mission.

Archival runs automatically at the end of `syncLatestMissionsFromReddit`, and
manually via **Archive Old Missions** in options (`ARCHIVE_OLD_MISSIONS`).
A record with no known date is never archived.

## The prune rule

`pruneUnflairedJunkMissionsFromStorage` (and its twin in `chunks/missions-*.js`)
deletes genuine junk and tags it into `nonMissionPosts` so sync will not
re-import it. Because that tagging is **permanent**, the guards matter:

1. Skip tombstones.
2. Skip anything whose kind is not `notMission` or `unknown` — this is what
   protects Daily Dungeons.
3. Skip devvit-enriched records.
4. Only prune once the post is past `FLAIR_GRACE_MS`.

Guard 4 was previously inverted: the comparison kept placeholders **older** than
the cutoff and deleted **fresh** ones, so a post that was simply waiting on a
moderator to apply flair was deleted and permanently blacklisted.

## Sync triggers

Sync is manual (options buttons) plus **on bot start**. `runStartBotAsyncWork`
calls `ensureLatestMissionSync`, bounded by `START_BOT_SYNC_BUDGET_MS` (20s) so a
slow sync cannot hold up starting; it continues in the background and lands in
time for the next queue lookup. `ensureLatestMissionSync` keeps a 2 minute cache
and refuses to run while the bot is mid-mission.

Previously the queue was only refreshed from Reddit once it ran **completely
dry**, so a non-empty queue meant new posts never appeared without pressing Sync
by hand.

There is still no periodic background alarm; that was a deliberate choice.
