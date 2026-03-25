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
var MAX_INPUT_LENGTH = 8e3;
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

// src/hooks/post-tool-use.ts
var SKIP_TOOLS = /* @__PURE__ */ new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "LS",
  "Agent",
  "TodoWrite",
  "AskUserQuestion",
  "TaskCreate",
  "TaskUpdate",
  "TaskGet",
  "TaskList",
  "SendMessage",
  "Skill",
  "ToolSearch"
]);
function extractFiles(toolName, toolInput) {
  const files = [];
  if (!toolInput) return files;
  if (typeof toolInput === "object" && toolInput.file_path) {
    files.push(toolInput.file_path);
  }
  if (toolName === "Bash" && typeof toolInput === "object" && toolInput.command) {
    const pathMatches = toolInput.command.match(/(?:^|\s)(\/[\w./-]+\.\w+)/g);
    if (pathMatches) {
      files.push(...pathMatches.map((m) => m.trim()));
    }
  }
  return [...new Set(files)];
}
function truncate(value, maxLen) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}
async function main() {
  try {
    writeHookStatus("PostToolUse", { lastFiredAt: Date.now(), success: true });
    const input = await readStdin();
    const { tool_name, tool_input, tool_response, cwd } = input;
    if (!tool_name || SKIP_TOOLS.has(tool_name)) {
      return output({});
    }
    const files = extractFiles(tool_name, tool_input);
    await daemonRequest("POST", "/observations", {
      tool_name,
      tool_input: truncate(tool_input, MAX_INPUT_LENGTH),
      tool_response: truncate(tool_response, MAX_INPUT_LENGTH),
      timestamp: Date.now(),
      cwd,
      files
    });
    output({});
  } catch (err) {
    writeHookStatus("PostToolUse", { lastFiredAt: Date.now(), success: false, error: String(err) });
    output({});
  }
}
main();
