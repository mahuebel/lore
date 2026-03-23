#!/usr/bin/env node
"use strict";

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

// src/hooks/utils.ts
function output(data) {
  console.log(JSON.stringify(data));
  process.exit(0);
}

// src/hooks/session-end.ts
writeHookStatus("SessionEnd", { lastFiredAt: Date.now(), success: true });
output({});
