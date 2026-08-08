# LazyFrog Logs

All extension logs are written here as **indexed, indented** `.txt` and `.md` files.

## Quick start

```bash
node log-server.js
```

Then enable remote logging in LazyFrog options, or in a Reddit tab console:

```js
lazyfrog.enableFetchDebug()
```

Every log line gets a **6-digit sequence number** `[000001]` so you can grep or jump by index.

## Folder layout

```
Logs/
  README.md
  index.md                    # links to every session (updated on server start)
  sessions/
    <session-id>/
      INDEX.md                # table: seq | time | level | source | message
      all.txt                 # full session — indented plain text
      all.md                  # full session — markdown with JSON blocks
      all.jsonl               # machine-readable, one entry per line
      by-source/
        REDDIT.txt / .md
        SW.txt / .md
        background.txt / .md
      by-tag/
        PageReload.txt / .md
        RunGate.txt / .md
      special/
        modal-close-audit.txt      # every modal close attempt (screen + mission id)
        false-positive-restart.txt # same mission restarted after close = case study
        page-reload.jsonl
        storage-import.jsonl
      fetches/
        <timestamp>__<method>__<status>__<url>.bin
        <timestamp>__<method>__<status>__<url>.json
```

## Line format (all.txt)

```
[000042] 2026-05-29T14:30:01.234Z | WARN  | [REDDIT] (page-reload) [PageReload] content-script-init
  └─ data:
      {
        "reason": "content-script-init",
        "url": "https://www.reddit.com/..."
      }
```

## Import chrome.storage logs

Export from the LazyFrog options **Logging** tab, then:

```bash
node scripts/import-chrome-logs.js path/to/lazyfrog-logs-export.json
```

With the server running, POST instead:

```bash
curl -X POST -H "Content-Type: application/json" --data-binary @export.json http://localhost:7856/import/storage
```

Page-reload ring buffer (`lazyfrogPageReloadLog`):

```bash
node scripts/import-chrome-logs.js export.json --page-reload page-reload-export.json
```

## HTTP endpoints

| Route | Body | Purpose |
|-------|------|---------|
| `POST /log` | `{ ts, level, source, message, data }` | live extension logs |
| `POST /import/storage` | debugLogs export JSON | bulk import |
| `POST /import/page-reload` | `{ entries: [...] }` | page reload history |
