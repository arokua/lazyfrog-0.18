/**
 * Tests for the shared mission core.
 *
 * These rules decide what gets pruned from storage, so they are covered before
 * anything calls them. Zero dependencies -- run with:
 *
 *   node --test lib/
 */
const test = require('node:test');
const assert = require('node:assert');

require('./missionCore.js');
const core = globalThis.LazyFrogMissionCore;
const { MissionKind } = core;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 7, 8);

// ---------------------------------------------------------------------------
// Flair text extraction
// ---------------------------------------------------------------------------

test('extractFlairText prefers link_flair_text', () => {
	assert.strictEqual(core.extractFlairText({ link_flair_text: 'Level 21-40' }), 'Level 21-40');
});

test('extractFlairText falls back to richtext segments', () => {
	const post = { link_flair_richtext: [{ t: 'Level ' }, { t: '21-40' }] };
	assert.strictEqual(core.extractFlairText(post), 'Level 21-40');
});

test('extractFlairText returns empty string for an unflaired post', () => {
	assert.strictEqual(core.extractFlairText({ title: 'no flair here' }), '');
	assert.strictEqual(core.extractFlairText(null), '');
});

// ---------------------------------------------------------------------------
// Level range parsing
// ---------------------------------------------------------------------------

test('parseLevelRangeFromFlair handles the documented flair variants', () => {
	const cases = [
		['Level 21-40', { minLevel: 21, maxLevel: 40 }],
		['Levels 1-5', { minLevel: 1, maxLevel: 5 }],
		['Lv. 100-140', { minLevel: 100, maxLevel: 140 }],
		['Lv 260-300', { minLevel: 260, maxLevel: 300 }],
		['21-40', { minLevel: 21, maxLevel: 40 }],
		['Level 21–40', { minLevel: 21, maxLevel: 40 }], // en dash
		['Level 21—40', { minLevel: 21, maxLevel: 40 }], // em dash
		['★★★ Level 21-40', { minLevel: 21, maxLevel: 40 }],
	];
	for (const [input, expected] of cases) {
		assert.deepStrictEqual(core.parseLevelRangeFromFlair(input), expected, `flair: ${input}`);
	}
});

test('parseLevelRangeFromFlair rejects junk and impossible ranges', () => {
	assert.strictEqual(core.parseLevelRangeFromFlair(''), null);
	assert.strictEqual(core.parseLevelRangeFromFlair('Cloak'), null);
	assert.strictEqual(core.parseLevelRangeFromFlair('Daily Dungeon'), null);
	assert.strictEqual(core.parseLevelRangeFromFlair('Level 40-21'), null, 'inverted range');
	assert.strictEqual(core.parseLevelRangeFromFlair('Level 0-10'), null, 'min below 1');
	assert.strictEqual(core.parseLevelRangeFromFlair('50000-60000'), null, 'above MISSION_LEVEL_MAX');
});

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

test('parseDifficultyFromFlair counts stars and words', () => {
	assert.strictEqual(core.parseDifficultyFromFlair('★★★'), 3);
	assert.strictEqual(core.parseDifficultyFromFlair('3 stars'), 3);
	assert.strictEqual(core.parseDifficultyFromFlair('Level 21-40'), 0);
});

// ---------------------------------------------------------------------------
// Classification -- the rules the user specified
// ---------------------------------------------------------------------------

test('a normal level flair classifies as a playable mission', () => {
	const result = core.classifyMission({
		flairText: 'Level 21-40',
		title: 'Spicy Ramen Adventure',
		postedAt: NOW - HOUR,
		now: NOW,
	});
	assert.strictEqual(result.kind, MissionKind.MISSION);
	assert.deepStrictEqual(result.levels, { minLevel: 21, maxLevel: 40 });
});

test('Cloak flair is never a mission', () => {
	for (const flair of ['Cloak', 'cloak', '★ Cloak', 'Cloaks']) {
		const result = core.classifyMission({ flairText: flair, title: 'A cloak post', postedAt: NOW - HOUR, now: NOW });
		assert.strictEqual(result.kind, MissionKind.NOT_MISSION, `flair: ${flair}`);
		assert.strictEqual(result.reason, 'excludedFlair');
	}
});

test('Daily Dungeon flair is a mission of its own kind', () => {
	for (const flair of ['Daily Dungeon', 'daily dungeon', 'DailyDungeon']) {
		const result = core.classifyMission({ flairText: flair, title: 'Todays dungeon', postedAt: NOW - HOUR, now: NOW });
		assert.strictEqual(result.kind, MissionKind.DAILY_DUNGEON, `flair: ${flair}`);
	}
});

test('an unflaired post is UNKNOWN inside the grace window, not discarded', () => {
	const result = core.classifyMission({ flairText: '', title: 'Fresh post', postedAt: NOW - 2 * HOUR, now: NOW });
	assert.strictEqual(result.kind, MissionKind.UNKNOWN);
	assert.strictEqual(result.reason, 'awaitingFlair');
});

test('an unflaired post past the grace window is not a mission', () => {
	const result = core.classifyMission({ flairText: '', title: 'Old post', postedAt: NOW - 3 * DAY, now: NOW });
	assert.strictEqual(result.kind, MissionKind.NOT_MISSION);
	assert.strictEqual(result.reason, 'noFlairPastGrace');
});

test('an unflaired post with no known date stays UNKNOWN rather than being condemned', () => {
	const result = core.classifyMission({ flairText: '', title: 'Undated', postedAt: 0, now: NOW });
	assert.strictEqual(result.kind, MissionKind.UNKNOWN);
});

test('meta titles are rejected regardless of flair', () => {
	const result = core.classifyMission({ flairText: 'Level 21-40', title: 'Weekly Thread', postedAt: NOW - HOUR, now: NOW });
	assert.strictEqual(result.kind, MissionKind.NOT_MISSION);
	assert.strictEqual(result.reason, 'nonMissionTitle');
});

test('a flair with no level range is still a mission', () => {
	const result = core.classifyMission({ flairText: 'Boss Rush', title: 'Boss time', postedAt: NOW - HOUR, now: NOW });
	assert.strictEqual(result.kind, MissionKind.MISSION);
	assert.strictEqual(result.reason, 'flairWithoutLevels');
	assert.strictEqual(result.levels, null);
});

// ---------------------------------------------------------------------------
// Archival
// ---------------------------------------------------------------------------

test('isMissionArchived triggers past 30 days only', () => {
	assert.strictEqual(core.isMissionArchived({ postedAt: NOW - 29 * DAY }, NOW), false);
	assert.strictEqual(core.isMissionArchived({ postedAt: NOW - 31 * DAY }, NOW), true);
});

test('a mission with no known date is never treated as archived', () => {
	assert.strictEqual(core.isMissionArchived({ postId: 't3_abc' }, NOW), false);
});

test('getMissionPostedMs prefers postedAt, then createdUtc, then timestamp', () => {
	assert.strictEqual(core.getMissionPostedMs({ postedAt: 111, createdUtc: 2, timestamp: 333 }), 111);
	assert.strictEqual(core.getMissionPostedMs({ createdUtc: 2, timestamp: 333 }), 2000);
	assert.strictEqual(core.getMissionPostedMs({ timestamp: 333 }), 333);
	assert.strictEqual(core.getMissionPostedMs({}), null);
});

test('buildArchivedTombstone keeps only the id and date', () => {
	const tombstone = core.buildArchivedTombstone({
		postId: 't3_abc',
		postedAt: 1700000000000,
		createdUtc: 1700000000,
		missionTitle: 'Big mission',
		encounters: [{ type: 'enemy' }],
		foodImage: 'data:image/png;base64,AAAA',
		environment: 'mossy_forest',
	});
	assert.deepStrictEqual(tombstone, {
		postId: 't3_abc',
		archived: true,
		postedAt: 1700000000000,
		createdUtc: 1700000000,
	});
	assert.strictEqual(core.isTombstone(tombstone), true);
});

// ---------------------------------------------------------------------------
// Queue eligibility
// ---------------------------------------------------------------------------

test('only playable missions are queueable by default', () => {
	const queueable = (kind, filters) => core.isMissionKindQueueable({ missionKind: kind }, filters);
	assert.strictEqual(queueable(MissionKind.MISSION), true);
	assert.strictEqual(queueable(MissionKind.NOT_MISSION), false);
	assert.strictEqual(queueable(MissionKind.UNKNOWN), false);
	assert.strictEqual(queueable(MissionKind.DAILY_DUNGEON), false, 'excluded unless opted in');
	assert.strictEqual(queueable(MissionKind.DAILY_DUNGEON, { includeDailyDungeon: true }), true);
});

test('legacy records without a kind are treated as playable missions', () => {
	assert.strictEqual(core.getMissionKind({ postId: 't3_old' }), MissionKind.MISSION);
	assert.strictEqual(core.isMissionKindQueueable({ postId: 't3_old' }), true);
});

test('isAllStarsSelected requires all five distinct values', () => {
	assert.strictEqual(core.isAllStarsSelected([]), true);
	assert.strictEqual(core.isAllStarsSelected([1, 2, 3, 4, 5]), true);
	assert.strictEqual(core.isAllStarsSelected([1, 1, 2, 3, 4]), false, 'duplicates are not all stars');
	assert.strictEqual(core.isAllStarsSelected([3]), false);
});
