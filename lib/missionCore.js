/**
 * LazyFrog shared mission core.
 *
 * Single source of truth for flair parsing, mission classification, archival
 * and queue eligibility. Before this module these rules were reimplemented
 * independently in background.js, content-scripts/reddit.js,
 * chunks/missions-*.js and chunks/options-*.js, and had drifted apart -- e.g.
 * level-range parsing existed in four variants with different regex sets, so
 * the same flair could yield different levels depending on which context read
 * it.
 *
 * Loaded as a CLASSIC script in every context, exposing globalThis.LazyFrogMissionCore:
 *   - service worker    : importScripts('/lib/missionCore.js') at top of background.js
 *   - content scripts   : first entry of each `js` array in manifest.json
 *   - options / popup   : <script src="/lib/missionCore.js"> before the module bundle
 *
 * Keep this file dependency-free and DOM-free so it runs unchanged in all of them.
 */
(function () {
	'use strict';

	if (globalThis.LazyFrogMissionCore) return;

	const DAY_MS = 24 * 60 * 60 * 1000;

	/** Upper bound for a believable level range; guards against parsing junk like "2019-2024". */
	const MISSION_LEVEL_MAX = 9999;

	/** Level range assigned when a post has no parseable level flair. */
	const PLACEHOLDER_MIN_LEVEL = 1;
	const PLACEHOLDER_MAX_LEVEL = 999;

	/**
	 * Moderators routinely flair a post minutes-to-hours after it is submitted.
	 * Within this window an unflaired post is UNKNOWN (keep it, retry backfill);
	 * past it, an still-unflaired post is treated as NOT_MISSION.
	 */
	const FLAIR_GRACE_MS = 24 * 60 * 60 * 1000;

	/** Reddit archives posts ~30 days after posting; they can no longer be played. */
	const ARCHIVE_AFTER_DAYS = 30;

	const MissionKind = {
		/** A normal, playable mission. */
		MISSION: 'mission',
		/** Daily Dungeon: a real mission, but a separate game mode (its own Phaser scene). */
		DAILY_DUNGEON: 'dailyDungeon',
		/** Definitively not a mission (Cloak flair, or unflaired past the grace window). */
		NOT_MISSION: 'notMission',
		/** Too early to tell -- unflaired but still inside the grace window. */
		UNKNOWN: 'unknown',
	};

	/**
	 * Flairs that mark a post as not a mission at all. Matched on the normalized
	 * flair text, so "Cloak", "cloak", and "★ Cloak" all match.
	 */
	const NOT_MISSION_FLAIR_PATTERNS = [/\bcloaks?\b/i];

	/** Flairs that mark a post as a Daily Dungeon. */
	const DAILY_DUNGEON_FLAIR_PATTERNS = [/\bdaily\s*dungeons?\b/i];

	/** Titles that are clearly subreddit meta rather than missions. */
	const NON_MISSION_TITLE_PATTERNS = [
		/^the inn$/i,
		/megathread/i,
		/daily\s+thread/i,
		/weekly\s+thread/i,
		/mod\s+announcement/i,
		/^(discussion|question|help|bug)\b/i,
	];

	// ---------------------------------------------------------------------------
	// Flair text
	// ---------------------------------------------------------------------------

	/**
	 * Pull flair text off a raw Reddit API post object.
	 * Reddit exposes it as either `link_flair_text` or, for richtext flairs,
	 * an array of segments in `link_flair_richtext`.
	 */
	function extractFlairText(post) {
		if (!post || typeof post !== 'object') return '';
		if (post.link_flair_text) return String(post.link_flair_text).trim();
		const rich = post.link_flair_richtext;
		if (Array.isArray(rich)) {
			return rich
				.map((part) => part?.t || '')
				.join('')
				.trim();
		}
		return '';
	}

	/** Normalize dashes and strip star glyphs so the level regexes only see ASCII. */
	function normalizeFlairText(flairText) {
		if (!flairText) return '';
		return String(flairText)
			// U+2010..U+2015 (hyphen, en/em dash, bars) and U+2212 (minus) -> ASCII hyphen
			.replace(/[‐-―−]/g, '-')
			.replace(/[★☆]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	const LEVEL_RANGE_PATTERNS = [
		/(?:levels?|lv\.?)\s*(\d+)\s*-\s*(\d+)/i,
		/(\d+)\s*-\s*(\d+)\s*(?:levels?)/i,
		/^(\d+)\s*-\s*(\d+)$/,
		/(?:^|\s)(\d{1,4})\s*-\s*(\d{1,4})(?:\s|$)/,
	];

	/**
	 * Parse a "Level 21-40" style flair into {minLevel, maxLevel}, or null.
	 * Accepts en/em dashes and an "Lv." prefix.
	 */
	function parseLevelRangeFromFlair(flairText) {
		const normalized = normalizeFlairText(flairText);
		if (!normalized) return null;
		for (const pattern of LEVEL_RANGE_PATTERNS) {
			const match = normalized.match(pattern);
			if (!match) continue;
			const minLevel = Number.parseInt(match[1], 10);
			const maxLevel = Number.parseInt(match[2], 10);
			if (!Number.isFinite(minLevel) || !Number.isFinite(maxLevel)) continue;
			if (minLevel > maxLevel) continue;
			if (minLevel < 1 || maxLevel > MISSION_LEVEL_MAX) continue;
			return { minLevel, maxLevel };
		}
		return null;
	}

	/** Star difficulty 1-5 from flair, via ★ glyphs or an "N stars" phrase. 0 if unknown. */
	function parseDifficultyFromFlair(flairText) {
		if (!flairText || typeof flairText !== 'string') return 0;
		const filledStars = (flairText.match(/★/g) || []).length;
		if (filledStars >= 1 && filledStars <= 5) return filledStars;
		const wordMatch = flairText.match(/(\d)\s*stars?/i);
		if (wordMatch) {
			const value = Number.parseInt(wordMatch[1], 10);
			if (value >= 1 && value <= 5) return value;
		}
		return 0;
	}

	// ---------------------------------------------------------------------------
	// Classification
	// ---------------------------------------------------------------------------

	/** True for posts whose *title* marks them as subreddit meta. */
	function isNonMissionTitle(title) {
		const text = String(title || '').trim();
		if (!text) return true;
		return NON_MISSION_TITLE_PATTERNS.some((pattern) => pattern.test(text));
	}

	/**
	 * Classify by flair text alone, ignoring post age.
	 * Returns a MissionKind; UNKNOWN when there is no flair to judge by.
	 */
	function classifyFlair(flairText) {
		const normalized = normalizeFlairText(flairText);
		if (!normalized) return MissionKind.UNKNOWN;
		if (NOT_MISSION_FLAIR_PATTERNS.some((p) => p.test(normalized))) {
			return MissionKind.NOT_MISSION;
		}
		if (DAILY_DUNGEON_FLAIR_PATTERNS.some((p) => p.test(normalized))) {
			return MissionKind.DAILY_DUNGEON;
		}
		return MissionKind.MISSION;
	}

	/**
	 * Full classification for a post, combining flair, title and age.
	 *
	 * The age input matters because Reddit flair is frequently applied after the
	 * post goes up: an unflaired post is only condemned as NOT_MISSION once it has
	 * had FLAIR_GRACE_MS to acquire one.
	 *
	 * @returns {{kind: string, reason: string, flairText: string,
	 *            levels: {minLevel:number,maxLevel:number}|null, difficulty:number}}
	 */
	function classifyMission(input) {
		const flairText = typeof input?.flairText === 'string' ? input.flairText.trim() : '';
		const title = input?.title || '';
		const postedMs = Number(input?.postedAt) || 0;
		const now = Number(input?.now) || Date.now();

		const levels = parseLevelRangeFromFlair(flairText);
		const difficulty = parseDifficultyFromFlair(flairText);
		const base = { flairText, levels, difficulty };

		if (isNonMissionTitle(title)) {
			return { ...base, kind: MissionKind.NOT_MISSION, reason: 'nonMissionTitle' };
		}

		const flairKind = classifyFlair(flairText);

		if (flairKind === MissionKind.NOT_MISSION) {
			return { ...base, kind: MissionKind.NOT_MISSION, reason: 'excludedFlair' };
		}
		if (flairKind === MissionKind.DAILY_DUNGEON) {
			return { ...base, kind: MissionKind.DAILY_DUNGEON, reason: 'dailyDungeonFlair' };
		}
		if (flairKind === MissionKind.MISSION) {
			// Flaired, but the flair carries no level range. Still a mission.
			return {
				...base,
				kind: MissionKind.MISSION,
				reason: levels ? 'levelFlair' : 'flairWithoutLevels',
			};
		}

		// No flair at all -- decide by age.
		const ageMs = postedMs ? now - postedMs : null;
		if (ageMs === null || ageMs < FLAIR_GRACE_MS) {
			return { ...base, kind: MissionKind.UNKNOWN, reason: 'awaitingFlair' };
		}
		return { ...base, kind: MissionKind.NOT_MISSION, reason: 'noFlairPastGrace' };
	}

	/** Read the stored kind off a mission record, defaulting to MISSION for legacy records. */
	function getMissionKind(mission) {
		const kind = mission?.missionKind;
		if (kind && Object.values(MissionKind).includes(kind)) return kind;
		return MissionKind.MISSION;
	}

	/** True if this record is playable by the standard mission automation. */
	function isPlayableMission(mission) {
		return getMissionKind(mission) === MissionKind.MISSION;
	}

	// ---------------------------------------------------------------------------
	// Record helpers
	// ---------------------------------------------------------------------------

	function isPlaceholderLevelRange(mission) {
		return mission?.minLevel === PLACEHOLDER_MIN_LEVEL && mission?.maxLevel === PLACEHOLDER_MAX_LEVEL;
	}

	/** Best-known posting time in ms, preferring the most trustworthy source. */
	function getMissionPostedMs(mission) {
		if (!mission || typeof mission !== 'object') return null;
		if (typeof mission.postedAt === 'number' && mission.postedAt > 0) return mission.postedAt;
		if (typeof mission.createdUtc === 'number' && mission.createdUtc > 0) return mission.createdUtc * 1000;
		if (typeof mission.timestamp === 'number' && mission.timestamp > 0) return mission.timestamp;
		return null;
	}

	function getMissionAgeMs(mission, now = Date.now()) {
		const postedMs = getMissionPostedMs(mission);
		return postedMs ? now - postedMs : null;
	}

	// ---------------------------------------------------------------------------
	// Archival
	// ---------------------------------------------------------------------------

	/**
	 * Reddit archives posts after ~30 days, at which point they can never be played
	 * again. Records with no known date are treated as NOT archived, so a missing
	 * timestamp never silently destroys data.
	 */
	function isMissionArchived(mission, now = Date.now(), days = ARCHIVE_AFTER_DAYS) {
		const postedMs = getMissionPostedMs(mission);
		if (!postedMs) return false;
		return postedMs < now - days * DAY_MS;
	}

	function isTombstone(mission) {
		return mission?.archived === true;
	}

	/**
	 * Reduce an archived mission to the minimum needed to remember it existed:
	 * its id and when it was posted. All gameplay metadata is dropped.
	 *
	 * The record is deliberately KEPT rather than deleted so that user progress
	 * (cleared history) stays meaningful and sync never re-adds the post.
	 */
	function buildArchivedTombstone(mission) {
		if (!mission?.postId) return null;
		const postedAt = getMissionPostedMs(mission);
		const tombstone = { postId: mission.postId, archived: true };
		if (postedAt) tombstone.postedAt = postedAt;
		if (typeof mission.createdUtc === 'number' && mission.createdUtc > 0) {
			tombstone.createdUtc = mission.createdUtc;
		}
		return tombstone;
	}

	// ---------------------------------------------------------------------------
	// Queue eligibility
	// ---------------------------------------------------------------------------

	function normalizeStarFilter(stars) {
		if (!Array.isArray(stars)) return [];
		return stars.map(Number).filter((s) => Number.isFinite(s) && s >= 1 && s <= 5);
	}

	function isAllStarsSelected(stars) {
		const normalized = normalizeStarFilter(stars);
		if (normalized.length === 0) return true;
		return [1, 2, 3, 4, 5].every((d) => normalized.includes(d));
	}

	function getMissionStarDifficulty(mission) {
		const difficulty = Number(mission?.difficulty);
		if (Number.isFinite(difficulty) && difficulty > 0) {
			return Math.max(1, Math.min(5, Math.round(difficulty)));
		}
		const stars = Number(mission?.stars);
		if (Number.isFinite(stars) && stars > 0) {
			return Math.max(1, Math.min(5, Math.round(stars)));
		}
		return 0;
	}

	/**
	 * Kind-aware gate applied before any user filter.
	 *
	 * Daily Dungeons are real missions but run in a separate game mode that the
	 * standard automation does not drive, so they are excluded unless explicitly
	 * opted in via filters.includeDailyDungeon.
	 */
	function isMissionKindQueueable(mission, filters) {
		const kind = getMissionKind(mission);
		if (kind === MissionKind.NOT_MISSION || kind === MissionKind.UNKNOWN) return false;
		if (kind === MissionKind.DAILY_DUNGEON) return filters?.includeDailyDungeon === true;
		return true;
	}

	globalThis.LazyFrogMissionCore = {
		DAY_MS,
		MISSION_LEVEL_MAX,
		PLACEHOLDER_MIN_LEVEL,
		PLACEHOLDER_MAX_LEVEL,
		FLAIR_GRACE_MS,
		ARCHIVE_AFTER_DAYS,
		MissionKind,

		extractFlairText,
		normalizeFlairText,
		parseLevelRangeFromFlair,
		parseDifficultyFromFlair,

		isNonMissionTitle,
		classifyFlair,
		classifyMission,
		getMissionKind,
		isPlayableMission,

		isPlaceholderLevelRange,
		getMissionPostedMs,
		getMissionAgeMs,

		isMissionArchived,
		isTombstone,
		buildArchivedTombstone,

		normalizeStarFilter,
		isAllStarsSelected,
		getMissionStarDifficulty,
		isMissionKindQueueable,
	};
})();
