# 🐸 LazyFrog 0.16.1 — modified build

A browser extension that automates the [Sword & Supper](https://www.reddit.com/r/SwordAndSupperGame/)
Reddit game. It catalogs missions from the subreddit, stores them locally, and
plays them according to your filters.

This is a **personal, modified build** of LazyFrog. See
[Credit and upstream](#credit-and-upstream) — the original is not mine, and the
great majority of the code here is the original author's work.

---

## Credit and upstream

LazyFrog was created by **Allan Kimmer Jensen** ([@Saturate](https://github.com/Saturate)).

| | |
|---|---|
| Upstream repository | <https://github.com/Saturate/LazyFrog> |
| Project site | <https://lazyfrog.akj.io> |
| FrogDB (community mission database) | <https://frogdb.akj.io> |
| License | MIT |
| Base version | `0.16.1` |

Everything that makes this extension work — the XState orchestration, the
Devvit/Reddit content-script split, the shadow-DOM mission scanner, the Devvit
gateway gRPC enrichment, the automation engine, the options and popup UI — is
Allan's design and implementation. The changes described below are modifications
layered on top of that, and they would not exist without it.

If you want LazyFrog itself, get it from
[lazyfrog.akj.io](https://lazyfrog.akj.io/) or the upstream repo. Please report
issues with the original extension to [upstream](https://github.com/Saturate/LazyFrog/issues),
**not** to the author of this build — bugs here are most likely mine, not his.

A full copy of the upstream project (including its own git history) is vendored
at `old source/LazyFrog/` for reference. It is excluded from this repository's
version control.

---

## What this build is

The repository root **is** the extension — an unpacked, already-built Chrome
MV3 extension, edited in place.

That is unusual and worth understanding before you touch anything. The root was
originally produced by `wxt build` from `old source/LazyFrog/extension/`, but the
source has been stale since **November 2025** while roughly **+11,600 lines** of
behaviour were written directly into the built bundles. `manifest.json` has
likewise been hand-maintained and now declares permissions and scripts that the
source's `wxt.config.ts` does not.

> [!WARNING]
> **Do not run `wxt build`.** It would overwrite the root with the November 2025
> code and silently drop the `webNavigation` permission, the localhost host
> permissions, `content-scripts/autosell.js`, and `pageWorldKeepAlive.js`.

The reasoning is recorded in
[docs/decisions/2026-08-08-bundles-are-the-source-of-truth.md](docs/decisions/2026-08-08-bundles-are-the-source-of-truth.md).

---

## Install

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder

Works in Chrome, Brave, Edge and other Chromium browsers. Firefox and Safari are
not supported.

### First run after updating from stock 0.16.1

Two one-off maintenance actions in **Options → Missions**:

1. **Classify Missions by Flair** — missions saved before this build have no
   flair recorded, so they are all treated as ordinary missions. This re-fetches
   their flair in batches of 100 and tags each one. Safe to re-run.
2. **Archive Old Missions** — collapses missions past Reddit's ~30 day archive
   window to tombstones. Run it manually the first time so you can see the count
   before sync starts doing it automatically.

---

## What's changed

### Mission categorization

Reddit flair was previously read for a level range and then **discarded**, so no
rule could depend on it. Flair text and a resolved kind are now stored on each
mission:

| Flair | Treated as | In the bot queue |
|---|---|---|
| `Level 21-40` and similar | Mission | Yes |
| `Daily Dungeon` | Its own kind | **Opt-in only** |
| `Cloak` | Not a mission | Never |
| *(none)* | Undecided for 24h, then not a mission | No |

Two decisions worth flagging:

- **Unflaired posts get a 24-hour grace window.** Moderators routinely flair a
  post hours after it goes up. Condemning an unflaired post immediately would
  delete real missions.
- **Daily Dungeons are excluded by default.** They *are* missions, but the game
  runs them in a separate Phaser scene that the standard automation does not
  drive. Enable **"Bot plays Daily Dungeons"** in the mission filters to include
  them.

### Archival

Reddit archives posts after ~30 days, after which they can never be played.
Those records are now reduced to a tombstone — post id and date only, everything
else dropped (2328 → 85 bytes on a representative record).

The record is **kept rather than deleted**, which is a deliberate change: the
previous cleanup deleted the mission *and* stripped the matching entries from
`userProgress`, destroying the cleared history for every archived mission.

### Mission fetching

New missions previously only arrived when the queue ran **completely dry** — a
non-empty queue meant nothing new was fetched until you pressed Sync by hand.
Starting the bot now runs a freshness sync, bounded by a 20-second budget so a
slow sync can't hold up the start.

### Bugs fixed

- **Pruning deleted fresh posts instead of stale ones.** The age comparison was
  inverted: it kept placeholders older than the cutoff and deleted ones within
  it, then blacklisted them permanently. Since a Daily Dungeon carries no level
  flair, every one would have been destroyed by this.
- **Archive cleanup destroyed cleared history** (see Archival above).
- **Enriching a mission dropped its post date.** `saveMissionToDatabase` rebuilt
  the record from scratch over a wholesale overwrite, losing `postedAt` and
  `createdUtc` — the exact fields archival and the queue age limit read.
- **Feed-scanned Daily Dungeons were dropped**, because the scanner returned
  early unless a post had a level range.
- **Level ranges parsed without bounds** in the Reddit content script, so a title
  like "2019-2024" could parse as a level range.
- **Deleted-mission counts were doubled** for missions stored under both a `t3_`
  and a legacy short key.

### Code cleanup

Flair parsing, classification, archival and queue gating now live in one
dependency-free module, `lib/missionCore.js`, loaded across all five extension
contexts. It replaced fourteen duplicated helpers spread across the bundles.

Level-range parsing alone had **four independent implementations with different
regexes**, so the same flair could yield different levels depending on which
context happened to read it — the options copy carried only two of the four
patterns and never stripped star glyphs, so `★★★ Level 21-40` parsed everywhere
except there. There is now exactly one implementation of each rule.

### Repository

The built extension is now under **version control**, which it previously was
not. Google OAuth client and token files under `scripts/` are excluded as
secrets.

---

## Development

There is no build step. Edit the bundles at the root directly, then reload the
extension at `chrome://extensions/`.

### Tests

```bash
node --test lib/missionCore.test.js
```

21 unit tests covering the flair, classification and archival rules. They have no
dependencies and no test runner to install.

### Debugging

Run the log server and enable `automationConfig.remoteLogging` to stream logs to
disk under `Logs/`:

```bash
node log-server.js
```

Inspect contexts at:

1. **Background** — `chrome://extensions/` → *Service Worker*
2. **Reddit page** — DevTools on the Reddit tab
3. **Game iframe** — DevTools → select the `devvit.net` frame
4. **Popup / Options** — right-click → Inspect

### Documentation

| Document | Contents |
|---|---|
| [decisions/](docs/decisions/) | Why the refactor happened in the bundles |
| [architecture/mission-classification.md](docs/architecture/mission-classification.md) | Flair rules, mission kinds, tombstones, the shared core |
| [architecture/state-machine.md](docs/architecture/state-machine.md) | Bot orchestration (upstream) |
| [architecture/reddit-data-structure.md](docs/architecture/reddit-data-structure.md) | Mission record shape and scanning |
| [changelogs/](docs/changelogs/) | Per-session change summaries |

Note that the upstream `extension/README.md` describes React 18, Webpack 5 and
IndexedDB. The actual stack is **React 19, WXT/Vite, XState v5 and
`chrome.storage.local`**.

---

## License

MIT, inherited from the upstream project. Copyright belongs to
Allan Kimmer Jensen and contributors; the modifications described above are
offered under the same terms.

## Disclaimer

For educational purposes. Automating a game may conflict with Reddit's Terms of
Service or the game's own rules — that is your call to make, and your risk.
