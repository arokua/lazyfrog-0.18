#!/usr/bin/env node
/**
 * LazyFrog remote log server.
 *
 * Run:  node log-server.js
 *
 * Writes indexed logs under ./Logs/ (see Logs/README.md).
 * Also prints colorized lines to the terminal.
 *
 * Extension setup:
 *   automationConfig.remoteLogging = true
 *   automationConfig.remoteUrl     = "http://localhost:7856/log"
 *
 * Or in a Reddit tab console: lazyfrog.enableFetchDebug()
 *
 * Import chrome.storage export:
 *   node scripts/import-chrome-logs.js path/to/lazyfrog-logs-export.json
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  LogWriter,
  importChromeExport,
  importPageReloadLog,
  safeFileName
} = require("./log-writer");

const PORT = Number(process.env.PORT || 7856);
const MAX_BODY_BYTES = Number(process.env.LF_MAX_BODY_BYTES || 32 * 1024 * 1024);

const writer = new LogWriter();
const FETCH_DIR = writer.getFetchDir();

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  blue: "\x1b[34m"
};

function colorForLevel(level) {
  switch ((level || "").toLowerCase()) {
    case "error":
      return COLORS.red;
    case "warn":
    case "warning":
      return COLORS.yellow;
    case "info":
      return COLORS.cyan;
    case "debug":
      return COLORS.dim;
    default:
      return COLORS.green;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error(`payload too large (>${MAX_BODY_BYTES} bytes)`));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function shortenUrlForFile(url) {
  try {
    const u = new URL(url);
    const hostPath = (u.host + u.pathname).replace(/[^a-z0-9.\-_]+/gi, "_");
    return hostPath.slice(0, 80);
  } catch {
    return String(url || "unknown").replace(/[^a-z0-9.\-_]+/gi, "_").slice(0, 80);
  }
}

function looksLikeFetchEntry(message, data) {
  if (!data || typeof data !== "object") return false;
  return typeof data.bodyBase64 === "string" && data.bodyBase64.length > 0;
}

function writeFetchArtifact(ts, data) {
  const safeUrl = shortenUrlForFile(data.url);
  const fileBase = `${ts}__${data.method || "GET"}__${data.status || 0}__${safeUrl}`;
  const binPath = path.join(FETCH_DIR, `${fileBase}.bin`);
  const metaPath = path.join(FETCH_DIR, `${fileBase}.json`);
  try {
    fs.writeFileSync(binPath, Buffer.from(data.bodyBase64, "base64"));
  } catch {}
  try {
    const meta = { ...data };
    delete meta.bodyBase64;
    delete meta.bodyBase64Preview;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch {}
  return binPath;
}

function formatTail(data, isFetch) {
  if (!data) return "";
  if (isFetch) {
    const summary = {
      url: data.url,
      method: data.method,
      status: data.status,
      bodyLength: data.bodyLength,
      elapsedMs: data.elapsedMs,
      postId: data.postId || null
    };
    return ` ${COLORS.dim}${JSON.stringify(summary)}${COLORS.reset}`;
  }
  try {
    if (typeof data === "object" && Object.keys(data).length === 0) return "";
    return ` ${COLORS.dim}${JSON.stringify(data)}${COLORS.reset}`;
  } catch {
    return "";
  }
}

function handleLogEntry(entry) {
  const ts = entry.ts || entry.timestamp || Date.now();
  const level = (entry.level || "log").toUpperCase();
  const source = entry.source || entry.scope || entry.tag || "";
  const message = entry.message || entry.msg || "";
  const data = entry.data ?? entry.payload ?? null;

  const isFetch = looksLikeFetchEntry(message, data);
  let savedPath = null;
  if (isFetch) {
    savedPath = writeFetchArtifact(ts, data);
  }

  const color = colorForLevel(level);
  const when = new Date(ts).toISOString().replace("T", " ").replace("Z", "");
  const head = `${COLORS.dim}${when}${COLORS.reset} ${color}${level.padEnd(5)}${COLORS.reset}`;
  const tag = source ? ` ${COLORS.magenta}[${source}]${COLORS.reset}` : "";
  const tail = formatTail(data, isFetch);
  const saved = savedPath ? `\n    ${COLORS.blue}saved -> ${savedPath}${COLORS.reset}` : "";
  process.stdout.write(`${head}${tag} ${message}${tail}${saved}\n`);

  const persistedData = isFetch
    ? {
        ...data,
        bodyBase64: undefined,
        bodyBase64Preview: undefined,
        savedTo: savedPath
      }
    : data;

  const auditKind = entry.kind || persistedData?.auditKind || null;
  const { seq } = writer.write(
    {
      ts,
      level,
      source,
      message,
      data: persistedData,
      kind: isFetch ? "fetch" : auditKind || undefined
    },
    {
      special:
        auditKind === "modal-close-audit" || auditKind === "false-positive-restart"
          ? auditKind
          : undefined
    }
  );

  return { seq, savedPath };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const route = (req.url || "").split("?")[0];

  if (req.method === "POST" && route === "/import/storage") {
    try {
      const raw = await readBody(req);
      const result = importChromeExport(writer, raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result, sessionId: writer.sessionId }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && route === "/import/page-reload") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      const result = importPageReloadLog(writer, body.entries || body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result, sessionId: writer.sessionId }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method !== "POST" || route !== "/log") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(
      "LazyFrog log server\nPOST /log\nPOST /import/storage\nPOST /import/page-reload\n"
    );
    return;
  }

  try {
    const raw = await readBody(req);
    const entry = JSON.parse(raw);
    const result = handleLogEntry(entry);
    res.writeHead(204);
    res.end();
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Bad JSON: ${err.message}\n`);
  }
});

server.on("listening", () => {
  console.log(
    `${COLORS.green}LazyFrog log server listening on http://localhost:${PORT}/log${COLORS.reset}`
  );
  console.log(`${COLORS.dim}Session: ${writer.sessionId}${COLORS.reset}`);
  console.log(`${COLORS.dim}Writing logs under: ${writer.sessionDir}${COLORS.reset}`);
  console.log(`${COLORS.dim}Fetch bodies: ${FETCH_DIR}${COLORS.reset}`);
  console.log(`${COLORS.dim}Press Ctrl+C to stop.${COLORS.reset}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `${COLORS.red}Port ${PORT} is already in use. Run with PORT=<other> node log-server.js${COLORS.reset}`
    );
    process.exit(1);
  }
  console.error(`${COLORS.red}Server error:${COLORS.reset}`, err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1");
