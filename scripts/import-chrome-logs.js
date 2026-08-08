#!/usr/bin/env node
/**
 * Import a LazyFrog chrome.storage debugLogs export into ./Logs/
 *
 * Usage:
 *   node scripts/import-chrome-logs.js path/to/export.json
 *   node scripts/import-chrome-logs.js path/to/export.json --page-reload path/to/reload.json
 *
 * With log-server running you can POST instead:
 *   curl -X POST -H "Content-Type: application/json" --data-binary @export.json http://localhost:7856/import/storage
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  LogWriter,
  importChromeExport,
  importPageReloadLog
} = require("../log-writer");

const args = process.argv.slice(2);
const exportPath = args.find((a) => !a.startsWith("--"));
const pageReloadIdx = args.indexOf("--page-reload");
const pageReloadPath = pageReloadIdx >= 0 ? args[pageReloadIdx + 1] : null;
const useHttp = args.includes("--http");
const port = Number(process.env.PORT || 7856);

if (!exportPath) {
  console.error(
    "Usage: node scripts/import-chrome-logs.js <export.json> [--page-reload reload.json] [--http]"
  );
  process.exit(1);
}

async function postJson(route, body) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${route} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const abs = path.resolve(exportPath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, "utf8");
  const payload = JSON.parse(raw);

  if (useHttp) {
    const storageResult = await postJson("/import/storage", payload);
    console.log("Imported debugLogs via HTTP:", storageResult);
    if (pageReloadPath) {
      const reloadRaw = JSON.parse(fs.readFileSync(path.resolve(pageReloadPath), "utf8"));
      const entries = Array.isArray(reloadRaw) ? reloadRaw : reloadRaw.lazyfrogPageReloadLog || reloadRaw.entries || [];
      const reloadResult = await postJson("/import/page-reload", { entries });
      console.log("Imported page-reload via HTTP:", reloadResult);
    }
    return;
  }

  const sessionId = `import-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const writer = new LogWriter({ sessionId });
  const storageResult = importChromeExport(writer, payload);
  console.log(`Imported ${storageResult.imported} debug log(s) → ${writer.sessionDir}`);

  if (pageReloadPath) {
    const reloadAbs = path.resolve(pageReloadPath);
    const reloadRaw = JSON.parse(fs.readFileSync(reloadAbs, "utf8"));
    const entries = Array.isArray(reloadRaw) ? reloadRaw : reloadRaw.lazyfrogPageReloadLog || reloadRaw.entries || [];
    const reloadResult = importPageReloadLog(writer, entries);
    console.log(`Imported ${reloadResult.imported} page-reload event(s)`);
  }

  writer._refreshRootIndex();
  console.log(`Done. Open Logs/sessions/${sessionId}/INDEX.md`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
