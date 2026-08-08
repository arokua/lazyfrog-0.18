#!/usr/bin/env node
/**
 * Write modal-close audit entries from chrome.storage export into Logs/special/
 *
 * Export lazyfrogModalCloseAudit from DevTools:
 *   chrome.storage.local.get("lazyfrogModalCloseAudit", console.log)
 *
 * Save as modal-close-audit-export.json then:
 *   node scripts/export-modal-close-audit.js modal-close-audit-export.json
 *
 * Or POST to running log-server:
 *   node scripts/export-modal-close-audit.js export.json --http
 */

const fs = require("node:fs");
const path = require("node:path");
const { LogWriter } = require("../log-writer");

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith("--"));
const useHttp = args.includes("--http");
const port = Number(process.env.PORT || 7856);

function formatLine(entry) {
  const ts = entry.ts || Date.now();
  const event = entry.event || "UNKNOWN";
  return (
    `[${new Date(ts).toISOString()}] ${event}` +
    ` | mission=${entry.missionId || "?"}` +
    ` | screen=${entry.screen ?? "null"}` +
    ` | state=${entry.botState || entry.state || "?"}` +
    ` | phase=${entry.gamePhase ?? "?"}` +
    ` | dialog=${entry.dialogOpen ?? "?"}` +
    ` | midMission=${entry.midMission ?? "?"}` +
    ` | source=${entry.source || entry.restartSource || "?"}`
  );
}

async function postLog(payload) {
  const res = await fetch(`http://127.0.0.1:${port}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`POST /log failed (${res.status})`);
}

async function main() {
  if (!inputPath) {
    console.error("Usage: node scripts/export-modal-close-audit.js <export.json> [--http]");
    process.exit(1);
  }
  const abs = path.resolve(inputPath);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.lazyfrogModalCloseAudit)
      ? raw.lazyfrogModalCloseAudit
      : [];
  if (!entries.length) {
    console.error("No lazyfrogModalCloseAudit entries found in file.");
    process.exit(1);
  }

  if (useHttp) {
    for (const entry of entries) {
      const kind =
        entry.event === "FALSE_POSITIVE_RESTART" ? "false-positive-restart" : "modal-close-audit";
      const line = formatLine(entry);
      await postLog({
        ts: entry.ts || Date.now(),
        level: kind === "false-positive-restart" ? "ERROR" : "WARN",
        source: "IMPORT",
        kind,
        message: line,
        data: entry
      });
    }
    console.log(`Posted ${entries.length} audit line(s) to http://127.0.0.1:${port}/log`);
    return;
  }

  const sessionId = `modal-audit-import-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const writer = new LogWriter({ sessionId });
  for (const entry of entries) {
    const kind =
      entry.event === "FALSE_POSITIVE_RESTART" ? "false-positive-restart" : "modal-close-audit";
    writer.write(
      {
        ts: entry.ts || Date.now(),
        level: kind === "false-positive-restart" ? "ERROR" : "WARN",
        source: "IMPORT",
        message: formatLine(entry),
        data: entry,
        kind
      },
      { special: kind }
    );
  }
  writer._refreshRootIndex();
  console.log(`Wrote ${entries.length} line(s) under Logs/sessions/${sessionId}/special/`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
