#!/usr/bin/env node
"use strict";

// src/hooks/utils.ts
var DAEMON_URL = "http://localhost:37778";
async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    process.stdin.on("error", () => resolve({}));
    setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString()) : {});
    }, 3e3);
  });
}
async function daemonRequest(method, path, body, timeoutMs = 5e3) {
  try {
    const resp = await fetch(`${DAEMON_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : void 0,
      body: body ? JSON.stringify(body) : void 0,
      signal: AbortSignal.timeout(timeoutMs)
    });
    return resp.json();
  } catch {
    return null;
  }
}
function output(data) {
  console.log(JSON.stringify(data));
  process.exit(0);
}

// src/hook-heartbeat.ts
var import_fs = require("fs");

// src/types.ts
var LORE_DIR = process.env.HOME ? `${process.env.HOME}/.lore` : "/tmp/.lore";
var PID_FILE = `${LORE_DIR}/daemon.pid`;
var SUGGESTIONS_FILE = `${LORE_DIR}/pending-suggestions.json`;
var HOOK_STATUS_FILE = `${LORE_DIR}/hook-status.json`;
var SESSION_HISTORY_FILE = `${LORE_DIR}/session-history.json`;

// src/hook-heartbeat.ts
function writeHookStatus(hookName, status) {
  try {
    (0, import_fs.mkdirSync)(LORE_DIR, { recursive: true });
    let existing = {};
    try {
      existing = JSON.parse((0, import_fs.readFileSync)(HOOK_STATUS_FILE, "utf-8"));
    } catch {
    }
    existing[hookName] = status;
    const tmpFile = `${HOOK_STATUS_FILE}.tmp`;
    (0, import_fs.writeFileSync)(tmpFile, JSON.stringify(existing, null, 2));
    (0, import_fs.renameSync)(tmpFile, HOOK_STATUS_FILE);
  } catch {
  }
}

// src/hooks/stop.ts
async function main() {
  try {
    writeHookStatus("Stop", { lastFiredAt: Date.now(), success: true });
    const input = await readStdin();
    if (input.stop_hook_active) {
      return output({ ok: true });
    }
    const observations = await daemonRequest("POST", "/observations/drain");
    if (!observations || !Array.isArray(observations) || observations.length === 0) {
      return output({ ok: true });
    }
    process.stderr.write(`[vault-sync] sending ${observations.length} observations for background evaluation
`);
    await daemonRequest("POST", "/evaluate", { observations });
    output({ ok: true });
  } catch (err) {
    writeHookStatus("Stop", { lastFiredAt: Date.now(), success: false, error: String(err) });
    process.stderr.write(`[vault-sync] stop hook error: ${err}
`);
    output({ ok: true });
  }
}
main();
