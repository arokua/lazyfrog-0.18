/**
 * LazyFrog mission telemetry.
 *
 * Turns one completed mission into one CSV row, for regression analysis of what
 * actually drives clear time -- encounter mix, enemy count, difficulty, the
 * automation options in force, the player's build, and the game speed
 * multiplier.
 *
 * Two facts shape the design:
 *
 *   1. A cleared mission is rewritten as `compactCleared`, which DROPS its
 *      `encounters` array. Every encounter-derived metric must therefore be
 *      snapshotted when the mission STARTS. Computing it at completion time
 *      reads an empty array and silently reports zeroes.
 *
 *   2. Rows are only ever appended, and a run can span thousands of missions,
 *      so the store is capped and drops oldest-first.
 *
 * Loaded as a CLASSIC script, exposing globalThis.LazyFrogMissionTelemetry:
 *   - service worker : importScripts('/lib/missionTelemetry.js') in background.js
 *   - options page   : <script src="/lib/missionTelemetry.js"> before the bundle
 *
 * Keep this file dependency-free and DOM-free so it runs unchanged in both.
 */
(function () {
	'use strict';

	if (globalThis.LazyFrogMissionTelemetry) return;

	/** chrome.storage.local key holding the accumulated rows. */
	const TELEMETRY_STORAGE_KEY = 'lazyfrogTelemetryRows';

	/**
	 * Oldest rows are dropped past this. At ~250 bytes a row this is a few MB,
	 * comfortably inside the unlimitedStorage-backed local area, and far more
	 * than any single analysis session needs.
	 */
	const MAX_TELEMETRY_ROWS = 20000;

	/**
	 * Encounter `type` values, from the game bundle's EncounterType enum. Only
	 * the ones that describe combat load are broken out; the rest fold into
	 * `otherEncounters` so the columns stay stable if the game adds more.
	 */
	const ENEMY_ENCOUNTER = 'enemy';
	const BOSS_ENCOUNTER = 'boss';
	const CROSSROADS_FIGHT_ENCOUNTER = 'crossroadsFight';
	const RUSH_BOSS_ENCOUNTER = 'rushBoss';

	const COMBAT_ENCOUNTER_TYPES = new Set([
		ENEMY_ENCOUNTER,
		BOSS_ENCOUNTER,
		CROSSROADS_FIGHT_ENCOUNTER,
		RUSH_BOSS_ENCOUNTER,
	]);

	/**
	 * Column order for the emitted CSV. Explicit rather than derived from the
	 * first row's keys, so a row missing a field still lines up and the header
	 * does not change shape between exports.
	 */
	const TELEMETRY_COLUMNS = [
		'completedAt',
		'postId',
		'missionTitle',
		'environment',
		'rarity',
		'difficulty',
		'minLevel',
		'maxLevel',

		'encounterCount',
		'enemyEncounters',
		'bossEncounters',
		'crossroadsFightEncounters',
		'rushBossEncounters',
		'combatEncounters',
		'otherEncounters',
		'enemyCount',
		'maxEnemiesInEncounter',

		'playMs',
		'wallMs',
		'outcome',
		'completionSource',

		'build',
		'gameSpeedMultiplier',
		'autoPlay',
		'crossroadsStrategy',
		'skillBargainStrategy',
		'autoAcceptSkillBargains',
		'creatorBonusPreference',
		'abilityTierListHash',
		'blessingStatPriorityHash',

		'extensionVersion',
	];

	/**
	 * Reduce an ordered list to a short stable digest. The ability tier list and
	 * blessing priority are long ordered arrays that would swamp a CSV cell, but
	 * they do affect clear time, so each distinct ordering needs to be
	 * distinguishable across rows -- a grouping key, not a recoverable value.
	 */
	function hashOrderedList(list) {
		if (!Array.isArray(list) || list.length === 0) return '';
		let h = 2166136261;
		const joined = list.join('');
		for (let i = 0; i < joined.length; i++) {
			h ^= joined.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return (h >>> 0).toString(36) + '.' + list.length;
	}

	function countEnemies(encounter) {
		if (Array.isArray(encounter?.enemies)) return encounter.enemies.length;
		return 0;
	}

	/**
	 * Encounter-derived metrics. MUST be called while the mission still carries
	 * its encounters -- see the compactCleared note at the top of this file.
	 */
	function summarizeEncounters(encounters) {
		const summary = {
			encounterCount: 0,
			enemyEncounters: 0,
			bossEncounters: 0,
			crossroadsFightEncounters: 0,
			rushBossEncounters: 0,
			combatEncounters: 0,
			otherEncounters: 0,
			enemyCount: 0,
			maxEnemiesInEncounter: 0,
		};
		if (!Array.isArray(encounters)) return summary;

		summary.encounterCount = encounters.length;
		for (const encounter of encounters) {
			const type = encounter?.type;
			if (type === ENEMY_ENCOUNTER) summary.enemyEncounters++;
			else if (type === BOSS_ENCOUNTER) summary.bossEncounters++;
			else if (type === CROSSROADS_FIGHT_ENCOUNTER) summary.crossroadsFightEncounters++;
			else if (type === RUSH_BOSS_ENCOUNTER) summary.rushBossEncounters++;

			if (COMBAT_ENCOUNTER_TYPES.has(type)) summary.combatEncounters++;
			else summary.otherEncounters++;

			const enemies = countEnemies(encounter);
			summary.enemyCount += enemies;
			if (enemies > summary.maxEnemiesInEncounter) {
				summary.maxEnemiesInEncounter = enemies;
			}
		}
		return summary;
	}

	/**
	 * Snapshot taken when a mission starts. Held in memory by the caller until
	 * the matching completion arrives.
	 */
	function buildMissionSnapshot({ postId, missionMetadata, navigationStartedMs, playStartedMs }) {
		const meta = missionMetadata || {};
		return {
			postId: postId || meta.postId || '',
			missionTitle: meta.missionTitle || meta.foodName || '',
			environment: meta.environment || '',
			rarity: meta.rarity || '',
			difficulty: Number.isFinite(meta.difficulty) ? meta.difficulty : '',
			minLevel: Number.isFinite(meta.minLevel) ? meta.minLevel : '',
			maxLevel: Number.isFinite(meta.maxLevel) ? meta.maxLevel : '',
			navigationStartedMs: navigationStartedMs || 0,
			playStartedMs: playStartedMs || 0,
			...summarizeEncounters(meta.encounters),
		};
	}

	/**
	 * Combine a start snapshot with completion facts and the config in force.
	 * Returns null when there is no snapshot, since a row without the encounter
	 * metrics is not worth a line in the CSV.
	 */
	function buildTelemetryRow({ snapshot, completedAtMs, outcome, completionSource, config, extensionVersion }) {
		if (!snapshot) return null;
		const cfg = config || {};
		const completedAt = completedAtMs || Date.now();

		return {
			completedAt: new Date(completedAt).toISOString(),
			postId: snapshot.postId,
			missionTitle: snapshot.missionTitle,
			environment: snapshot.environment,
			rarity: snapshot.rarity,
			difficulty: snapshot.difficulty,
			minLevel: snapshot.minLevel,
			maxLevel: snapshot.maxLevel,

			encounterCount: snapshot.encounterCount,
			enemyEncounters: snapshot.enemyEncounters,
			bossEncounters: snapshot.bossEncounters,
			crossroadsFightEncounters: snapshot.crossroadsFightEncounters,
			rushBossEncounters: snapshot.rushBossEncounters,
			combatEncounters: snapshot.combatEncounters,
			otherEncounters: snapshot.otherEncounters,
			enemyCount: snapshot.enemyCount,
			maxEnemiesInEncounter: snapshot.maxEnemiesInEncounter,

			// Blank rather than a bogus number when the clock never started --
			// an empty CSV cell reads as NaN in pandas, a 0 reads as a real
			// instant clear and would quietly bias any regression.
			playMs: snapshot.playStartedMs ? completedAt - snapshot.playStartedMs : '',
			wallMs: snapshot.navigationStartedMs ? completedAt - snapshot.navigationStartedMs : '',
			outcome: outcome || 'cleared',
			completionSource: completionSource || '',

			build: cfg.telemetryBuild || '',
			gameSpeedMultiplier: Number(cfg.gameSpeedMultiplier) || 1,
			autoPlay: cfg.autoPlay !== false,
			crossroadsStrategy: cfg.crossroadsStrategy || '',
			skillBargainStrategy: cfg.skillBargainStrategy || '',
			autoAcceptSkillBargains: cfg.autoAcceptSkillBargains !== false,
			creatorBonusPreference: cfg.creatorBonusPreference || '',
			abilityTierListHash: hashOrderedList(cfg.abilityTierList),
			blessingStatPriorityHash: hashOrderedList(cfg.blessingStatPriority),

			extensionVersion: extensionVersion || '',
		};
	}

	/** RFC 4180: quote when the value could otherwise break the row. */
	function escapeCsvValue(value) {
		if (value === null || value === undefined) return '';
		const str = String(value);
		if (!/[",\n\r]/.test(str)) return str;
		return '"' + str.replace(/"/g, '""') + '"';
	}

	function toCsv(rows, columns = TELEMETRY_COLUMNS) {
		const lines = [columns.join(',')];
		for (const row of rows || []) {
			lines.push(columns.map((c) => escapeCsvValue(row?.[c])).join(','));
		}
		// Trailing newline so appending or concatenating exports stays valid.
		return lines.join('\n') + '\n';
	}

	/** Append with an oldest-first cap. Returns the list to persist. */
	function appendRow(existingRows, row, maxRows = MAX_TELEMETRY_ROWS) {
		const rows = Array.isArray(existingRows) ? existingRows : [];
		if (!row) return rows;
		const next = rows.concat([row]);
		if (next.length <= maxRows) return next;
		return next.slice(next.length - maxRows);
	}

	globalThis.LazyFrogMissionTelemetry = {
		TELEMETRY_STORAGE_KEY,
		MAX_TELEMETRY_ROWS,
		TELEMETRY_COLUMNS,

		summarizeEncounters,
		buildMissionSnapshot,
		buildTelemetryRow,
		hashOrderedList,
		escapeCsvValue,
		toCsv,
		appendRow,
	};
})();
