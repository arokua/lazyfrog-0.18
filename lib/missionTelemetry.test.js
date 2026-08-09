/**
 * Tests for mission telemetry.
 *
 * The encounter metrics feed a regression, so a silent miscount is worse than a
 * crash -- these pin the counting rules and the CSV escaping. Zero dependencies:
 *
 *   node --test lib/
 */
const test = require('node:test');
const assert = require('node:assert');

require('./missionTelemetry.js');
const telemetry = globalThis.LazyFrogMissionTelemetry;

const encounters = [
	{ type: 'enemy', enemies: [{ type: 'slime' }, { type: 'slime' }] },
	{ type: 'skillChoice' },
	{ type: 'enemy', enemies: [{ type: 'robot' }] },
	{ type: 'treasure' },
	{ type: 'crossroadsFight', enemies: [{ type: 'golem' }, { type: 'golem' }, { type: 'golem' }] },
	{ type: 'boss', enemies: [{ type: 'dragon' }] },
];

test('summarizeEncounters counts by type and totals enemies', () => {
	const s = telemetry.summarizeEncounters(encounters);
	assert.strictEqual(s.encounterCount, 6);
	assert.strictEqual(s.enemyEncounters, 2);
	assert.strictEqual(s.bossEncounters, 1);
	assert.strictEqual(s.crossroadsFightEncounters, 1);
	assert.strictEqual(s.rushBossEncounters, 0);
	assert.strictEqual(s.combatEncounters, 4);
	assert.strictEqual(s.otherEncounters, 2);
	assert.strictEqual(s.enemyCount, 7);
	assert.strictEqual(s.maxEnemiesInEncounter, 3);
});

test('summarizeEncounters is safe on a compactCleared mission', () => {
	for (const input of [undefined, null, [], 'nope']) {
		const s = telemetry.summarizeEncounters(input);
		assert.strictEqual(s.encounterCount, 0);
		assert.strictEqual(s.enemyCount, 0);
	}
});

test('an unknown encounter type still counts, as other', () => {
	const s = telemetry.summarizeEncounters([{ type: 'brandNewThing' }]);
	assert.strictEqual(s.encounterCount, 1);
	assert.strictEqual(s.otherEncounters, 1);
	assert.strictEqual(s.combatEncounters, 0);
});

test('both clocks are measured from their own start', () => {
	const snapshot = telemetry.buildMissionSnapshot({
		postId: 't3_abc',
		missionMetadata: { encounters, difficulty: 3, environment: 'fields' },
		navigationStartedMs: 1000,
		playStartedMs: 6000,
	});
	const row = telemetry.buildTelemetryRow({
		snapshot,
		completedAtMs: 26000,
		completionSource: 'inn-screen',
		config: { gameSpeedMultiplier: 4, telemetryBuild: 'lightning' },
	});
	assert.strictEqual(row.wallMs, 25000);
	assert.strictEqual(row.playMs, 20000);
	assert.strictEqual(row.enemyCount, 7);
	assert.strictEqual(row.gameSpeedMultiplier, 4);
	assert.strictEqual(row.build, 'lightning');
	assert.strictEqual(row.difficulty, 3);
});

test('a clock that never started is blank, not zero', () => {
	const snapshot = telemetry.buildMissionSnapshot({
		postId: 't3_abc',
		missionMetadata: {},
		navigationStartedMs: 0,
		playStartedMs: 0,
	});
	const row = telemetry.buildTelemetryRow({ snapshot, completedAtMs: 5000 });
	assert.strictEqual(row.playMs, '');
	assert.strictEqual(row.wallMs, '');
});

test('no snapshot yields no row', () => {
	assert.strictEqual(telemetry.buildTelemetryRow({ snapshot: null, completedAtMs: 1 }), null);
});

test('ordered-list hashes group by exact ordering', () => {
	const a = telemetry.hashOrderedList(['x', 'y', 'z']);
	assert.strictEqual(a, telemetry.hashOrderedList(['x', 'y', 'z']));
	assert.notStrictEqual(a, telemetry.hashOrderedList(['x', 'z', 'y']));
	assert.strictEqual(telemetry.hashOrderedList([]), '');
});

test('csv quotes commas, quotes and newlines', () => {
	assert.strictEqual(telemetry.escapeCsvValue('plain'), 'plain');
	assert.strictEqual(telemetry.escapeCsvValue('a,b'), '"a,b"');
	assert.strictEqual(telemetry.escapeCsvValue('say "hi"'), '"say ""hi"""');
	assert.strictEqual(telemetry.escapeCsvValue('two\nlines'), '"two\nlines"');
	assert.strictEqual(telemetry.escapeCsvValue(undefined), '');
});

test('toCsv emits the fixed header and aligns sparse rows', () => {
	const csv = telemetry.toCsv([{ postId: 't3_a' }, { postId: 't3_b', enemyCount: 4 }]);
	const lines = csv.trim().split('\n');
	assert.strictEqual(lines[0], telemetry.TELEMETRY_COLUMNS.join(','));
	assert.strictEqual(lines.length, 3);
	for (const line of lines) {
		assert.strictEqual(line.split(',').length, telemetry.TELEMETRY_COLUMNS.length);
	}
});

test('a mission title with a comma cannot break the row', () => {
	const csv = telemetry.toCsv([{ missionTitle: 'Stew, and Sorrow', postId: 't3_a' }]);
	const dataLine = csv.trim().split('\n')[1];
	assert.ok(dataLine.includes('"Stew, and Sorrow"'));
	assert.strictEqual(dataLine.split(',').length, telemetry.TELEMETRY_COLUMNS.length + 1);
});

test('appendRow caps oldest-first', () => {
	let rows = [];
	for (let i = 0; i < 5; i++) rows = telemetry.appendRow(rows, { postId: 'p' + i }, 3);
	assert.deepStrictEqual(rows.map((r) => r.postId), ['p2', 'p3', 'p4']);
});
