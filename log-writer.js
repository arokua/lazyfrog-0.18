/**
 * LazyFrog log file writer — indexed, indented .txt / .md / .jsonl under ./Logs/
 */

const fs = require("node:fs");
const path = require("node:path");

const LOGS_ROOT = process.env.LF_LOGS_DIR || path.join(__dirname, "Logs");

function padSeq(n) {
  return String(n).padStart(6, "0");
}

function safeFileName(name) {
  return String(name || "unknown")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "unknown";
}

function normalizeEntry(raw) {
  const ts = raw.ts ?? raw.timestamp ?? Date.now();
  const level = String(raw.level || raw.lvl || "log").toUpperCase();
  const source = raw.source || raw.scope || raw.context || raw.tag || "";
  const message = raw.message || raw.msg || "";
  const data = raw.data ?? raw.payload ?? raw.detail ?? null;
  const kind = raw.kind || raw.logKind || null;
  return { ts, level, source, message, data, kind, raw };
}

function indentData(data, spaces = 2) {
  if (data == null) return "";
  const pad = " ".repeat(spaces);
  try {
    const text =
      typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2);
    return text
      .split("\n")
      .map((line, i) => (i === 0 ? line : pad + line))
      .join("\n");
  } catch {
    return String(data);
  }
}

function formatTxtLine(seq, entry) {
  const when = new Date(entry.ts).toISOString();
  const src = entry.source ? `[${entry.source}] ` : "";
  const kind = entry.kind ? `(${entry.kind}) ` : "";
  const head = `[${padSeq(seq)}] ${when} | ${entry.level.padEnd(5)} | ${src}${kind}${entry.message}`;
  if (entry.data == null) return head + "\n";
  return `${head}\n  └─ data:\n    ${indentData(entry.data, 4)}\n`;
}

function formatMdBlock(seq, entry) {
  const when = new Date(entry.ts).toISOString();
  const src = entry.source || "—";
  const kind = entry.kind ? ` · ${entry.kind}` : "";
  let block = `#### [${padSeq(seq)}] ${when} — ${src}${kind} — ${entry.level}\n\n${entry.message}\n`;
  if (entry.data != null) {
    block += `\n\`\`\`json\n${indentData(entry.data, 0)}\n\`\`\`\n`;
  }
  return block + "\n";
}

function sourceKey(entry) {
  const s = String(entry.source || "unknown");
  const top = s.split(/[>/\s]/)[0].replace(/^\[|\]$/g, "") || "unknown";
  return safeFileName(top);
}

function tagKey(entry) {
  const msg = String(entry.message || "");
  const m = msg.match(/\[LazyFrog:([^\]]+)\]/);
  if (m) return safeFileName(m[1]);
  if (entry.kind) return safeFileName(entry.kind);
  return null;
}

class LogWriter {
  constructor(options = {}) {
    this.root = options.root || LOGS_ROOT;
    this.sessionId =
      options.sessionId ||
      new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.sessionDir = path.join(this.root, "sessions", this.sessionId);
    this.bySourceDir = path.join(this.sessionDir, "by-source");
    this.byTagDir = path.join(this.sessionDir, "by-tag");
    this.specialDir = path.join(this.sessionDir, "special");
    this.fetchDir = path.join(this.sessionDir, "fetches");
    this.seq = 0;
    this.indexRows = [];
    this.sourceHandles = new Map();
    this.tagHandles = new Map();
    this._ensureDirs();
    this._initSessionFiles();
    this._refreshRootIndex();
  }

  _ensureDirs() {
    for (const dir of [
      this.root,
      path.join(this.root, "sessions"),
      this.sessionDir,
      this.bySourceDir,
      this.byTagDir,
      this.specialDir,
      this.fetchDir
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _initSessionFiles() {
    const started = new Date().toISOString();
    const indexHeader = [
      `# Session ${this.sessionId}`,
      "",
      `Started: ${started}`,
      "",
      "## Quick index",
      "",
      "| Seq | Time | Level | Source | Message |",
      "|-----|------|-------|--------|---------|"
    ].join("\n");
    fs.writeFileSync(path.join(this.sessionDir, "INDEX.md"), indexHeader + "\n");
    fs.writeFileSync(
      path.join(this.sessionDir, "all.txt"),
      `LazyFrog session log — ${this.sessionId}\n${"=".repeat(60)}\n\n`
    );
    fs.writeFileSync(
      path.join(this.sessionDir, "all.md"),
      `# LazyFrog session log\n\n**Session:** \`${this.sessionId}\`  \n**Started:** ${started}\n\n---\n\n`
    );
    this._writeReadmeIfMissing();
  }

  _writeReadmeIfMissing() {
    const readme = path.join(this.root, "README.md");
    if (fs.existsSync(readme)) return;
    fs.writeFileSync(
      readme,
      [
        "# LazyFrog Logs",
        "",
        "Runtime logs from `node log-server.js` land here.",
        "",
        "## Layout",
        "",
        "```",
        "Logs/",
        "  README.md",
        "  index.md              # links to all sessions",
        "  sessions/",
        "    <session-id>/",
        "      INDEX.md          # table of every line (seq, time, level, source)",
        "      all.txt             # full session, indented plain text",
        "      all.md              # full session, markdown",
        "      all.jsonl           # one JSON object per line",
        "      by-source/          # REDDIT.txt, SW.txt, background.txt, …",
        "      by-tag/             # PageReload.txt, RunGate.txt, …",
        "      special/            # page-reload.jsonl, storage-import.jsonl",
        "      fetches/            # protobuf body dumps",
        "```",
        "",
        "## Start logging",
        "",
        "1. `node log-server.js`",
        "2. Enable remote logging in LazyFrog options.",
        "   For request/response bodies, also set `debugFetch` (no UI toggle yet) from",
        "   the service worker console at chrome://extensions:",
        "   ```js",
        "   chrome.storage.local.get(['automationConfig'], r =>",
        "     chrome.storage.local.set({ automationConfig: { ...(r.automationConfig || {}), debugFetch: true } }))",
        "   ```",
        "3. Import chrome.storage export: `node scripts/import-chrome-logs.js path/to/export.json`",
        ""
      ].join("\n")
    );
  }

  _append(filePath, text) {
    fs.appendFileSync(filePath, text);
  }

  _appendIndexRow(seq, entry) {
    const when = new Date(entry.ts).toISOString();
    const msg = String(entry.message || "").replace(/\|/g, "\\|").slice(0, 120);
    const row = `| ${padSeq(seq)} | ${when} | ${entry.level} | ${entry.source || "—"} | ${msg} |`;
    this.indexRows.push(row);
    this._append(path.join(this.sessionDir, "INDEX.md"), row + "\n");
  }

  _refreshRootIndex() {
    const sessionsDir = path.join(this.root, "sessions");
    let sessions = [];
    try {
      sessions = fs
        .readdirSync(sessionsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();
    } catch {}
    const lines = [
      "# LazyFrog log sessions",
      "",
      `Updated: ${new Date().toISOString()}`,
      "",
      "| Session | Files |",
      "|---------|-------|"
    ];
    for (const id of sessions) {
      lines.push(
        `| [${id}](./sessions/${id}/INDEX.md) | [all.txt](./sessions/${id}/all.txt) · [all.md](./sessions/${id}/all.md) |`
      );
    }
    lines.push("");
    fs.writeFileSync(path.join(this.root, "index.md"), lines.join("\n") + "\n");
  }

  _appendSource(entry, seq, txt, md) {
    const key = sourceKey(entry);
    const txtPath = path.join(this.bySourceDir, `${key}.txt`);
    const mdPath = path.join(this.bySourceDir, `${key}.md`);
    if (!this.sourceHandles.has(key)) {
      const banner = `# Source: ${key}\n\n`;
      if (!fs.existsSync(mdPath)) fs.writeFileSync(mdPath, banner);
      if (!fs.existsSync(txtPath)) fs.writeFileSync(txtPath, `Source: ${key}\n${"=".repeat(40)}\n\n`);
      this.sourceHandles.set(key, true);
    }
    this._append(txtPath, txt);
    this._append(mdPath, md);
  }

  _appendTag(entry, seq, txt, md) {
    const key = tagKey(entry);
    if (!key) return;
    const txtPath = path.join(this.byTagDir, `${key}.txt`);
    const mdPath = path.join(this.byTagDir, `${key}.md`);
    if (!this.tagHandles.has(key)) {
      const banner = `# Tag: ${key}\n\n`;
      if (!fs.existsSync(mdPath)) fs.writeFileSync(mdPath, banner);
      if (!fs.existsSync(txtPath)) fs.writeFileSync(txtPath, `Tag: ${key}\n${"=".repeat(40)}\n\n`);
      this.tagHandles.set(key, true);
    }
    this._append(txtPath, txt);
    this._append(mdPath, md);
  }

  write(entryInput, options = {}) {
    const entry = normalizeEntry(entryInput);
    this.seq += 1;
    const seq = this.seq;
    const txt = formatTxtLine(seq, entry);
    const md = formatMdBlock(seq, entry);
    const jsonl = JSON.stringify({ seq, ...entry, raw: undefined }) + "\n";

    this._append(path.join(this.sessionDir, "all.txt"), txt);
    this._append(path.join(this.sessionDir, "all.md"), md);
    this._append(path.join(this.sessionDir, "all.jsonl"), jsonl);
    this._appendIndexRow(seq, entry);
    this._appendSource(entry, seq, txt, md);
    this._appendTag(entry, seq, txt, md);

    if (options.special === "page-reload" || entry.kind === "page-reload") {
      this._append(
        path.join(this.specialDir, "page-reload.jsonl"),
        JSON.stringify({ seq, ...entry }) + "\n"
      );
    }
    if (options.special === "storage-import" || entry.kind === "storage-import") {
      this._append(
        path.join(this.specialDir, "storage-import.jsonl"),
        JSON.stringify({ seq, ...entry }) + "\n"
      );
    }
    if (options.special === "modal-close-audit" || entry.kind === "modal-close-audit") {
      const line =
        entry.message ||
        `${formatTxtLine(seq, entry).trim()}\n`;
      this._append(path.join(this.specialDir, "modal-close-audit.txt"), line.endsWith("\n") ? line : `${line}\n`);
      this._append(
        path.join(this.specialDir, "modal-close-audit.jsonl"),
        JSON.stringify({ seq, ...entry, raw: undefined }) + "\n"
      );
    }
    if (options.special === "false-positive-restart" || entry.kind === "false-positive-restart") {
      const line =
        entry.message ||
        `${formatTxtLine(seq, entry).trim()}\n`;
      this._append(
        path.join(this.specialDir, "false-positive-restart.txt"),
        line.endsWith("\n") ? line : `${line}\n`
      );
      this._append(
        path.join(this.specialDir, "false-positive-restart.jsonl"),
        JSON.stringify({ seq, ...entry, raw: undefined }) + "\n"
      );
    }

    return { seq, sessionId: this.sessionId, sessionDir: this.sessionDir };
  }

  getFetchDir() {
    return this.fetchDir;
  }
}

function importChromeExport(writer, exportJson) {
  const payload =
    typeof exportJson === "string" ? JSON.parse(exportJson) : exportJson;
  const logs = Array.isArray(payload.logs)
    ? payload.logs
    : Array.isArray(payload)
      ? payload
      : [];
  const results = [];
  for (const log of logs) {
    results.push(
      writer.write(
        {
          ts: log.timestamp ?? log.ts,
          level: log.level,
          source: log.context ?? log.source,
          message: log.message,
          data: log.data,
          kind: "storage-import"
        },
        { special: "storage-import" }
      )
    );
  }
  return { imported: results.length, exportDate: payload.exportDate || null };
}

function importPageReloadLog(writer, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const results = [];
  for (const e of list) {
    results.push(
      writer.write(
        {
          ts: e.storedAt ?? e.ts ?? Date.now(),
          level: "WARN",
          source: e.source || "page-reload",
          message: `[LazyFrog:PageReload] ${e.reason || "event"}`,
          data: e,
          kind: "page-reload"
        },
        { special: "page-reload" }
      )
    );
  }
  return { imported: results.length };
}

module.exports = {
  LOGS_ROOT,
  LogWriter,
  normalizeEntry,
  importChromeExport,
  importPageReloadLog,
  formatTxtLine,
  formatMdBlock,
  safeFileName
};
