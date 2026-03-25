#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/hooks/session-start.ts
var path = __toESM(require("node:path"), 1);
var import_node_child_process = require("node:child_process");

// src/hooks/utils.ts
var DAEMON_URL = "http://localhost:37778";
async function readStdin() {
  return new Promise((resolve3) => {
    if (process.stdin.isTTY) {
      resolve3({});
      return;
    }
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      try {
        resolve3(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve3({});
      }
    });
    process.stdin.on("error", () => resolve3({}));
    setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve3(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString()) : {});
    }, 3e3);
  });
}
async function daemonRequest(method, path2, body, timeoutMs = 5e3) {
  try {
    const resp = await fetch(`${DAEMON_URL}${path2}`, {
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

// src/vault-resolver.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_os = require("node:os");
function expandTilde(p) {
  if (p.startsWith("~/") || p === "~") {
    return (0, import_node_path.join)((0, import_node_os.homedir)(), p.slice(1));
  }
  return p;
}
function normalizePath(p) {
  return (0, import_node_path.resolve)(expandTilde(p));
}
function readProjectConfig(dir) {
  try {
    const configPath = (0, import_node_path.join)(dir, ".lore", "config.json");
    const raw = (0, import_node_fs.readFileSync)(configPath, "utf-8");
    const config = JSON.parse(raw);
    if (config.vault_path && typeof config.vault_path === "string") {
      return config;
    }
    return null;
  } catch {
    return null;
  }
}
function resolveVaultForProject(cwd) {
  let dir = (0, import_node_path.resolve)(cwd);
  while (true) {
    const config = readProjectConfig(dir);
    if (config) {
      return normalizePath(config.vault_path);
    }
    const parent = (0, import_node_path.dirname)(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (process.env.VAULT_PATH) {
    return normalizePath(process.env.VAULT_PATH);
  }
  const fallback = (0, import_node_path.join)((0, import_node_os.homedir)(), ".lore", "vault");
  try {
    (0, import_node_fs.statSync)(fallback);
    return normalizePath(fallback);
  } catch {
    return null;
  }
}

// src/hooks/session-start.ts
var RESOLVED_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..", "..");
function getPluginVersion() {
  return true ? "3.5.0" : "unknown";
}
function formatSuggestions(suggestions) {
  const lines = [
    "## Vault Suggestions",
    "",
    "Based on your last session, these discoveries may be worth capturing as vault notes:",
    ""
  ];
  suggestions.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.title}** (confidence: ${s.confidence.toFixed(2)})`);
    lines.push(`   Tags: ${s.tags.join(", ")}`);
    lines.push(`   Run: \`/vault-note ${s.title}\``);
    lines.push("");
  });
  lines.push("Use /vault-note to capture any of these.");
  return lines.join("\n");
}
async function main() {
  try {
    writeHookStatus("SessionStart", { lastFiredAt: Date.now(), success: true });
    await readStdin();
    let health = await daemonRequest("GET", "/health");
    const expectedVersion = getPluginVersion();
    const needsRestart = !health || (health.version || "unknown") !== expectedVersion;
    if (needsRestart) {
      if (health) {
        try {
          const daemonScript = path.join(RESOLVED_PLUGIN_ROOT, "dist", "daemon.cjs");
          (0, import_node_child_process.execFileSync)("node", [daemonScript, "stop"], {
            timeout: 5e3,
            stdio: "ignore"
          });
        } catch {
        }
      }
      try {
        const daemonScript = path.join(RESOLVED_PLUGIN_ROOT, "dist", "daemon.cjs");
        (0, import_node_child_process.execFileSync)("node", [daemonScript, "start"], {
          timeout: 15e3,
          stdio: "ignore"
        });
        health = await daemonRequest("GET", "/health");
      } catch {
        process.stderr.write("vault-sync: failed to start daemon\n");
      }
    }
    const currentVault = resolveVaultForProject(process.cwd());
    const vaultQuery = currentVault ? `?vault=${encodeURIComponent(currentVault)}` : "";
    const [suggestionsResp, notesResp] = await Promise.all([
      daemonRequest("GET", `/suggestions${vaultQuery}`),
      daemonRequest("GET", `/vault/notes${vaultQuery}`)
    ]);
    const suggestions = suggestionsResp?.suggestions || (Array.isArray(suggestionsResp) ? suggestionsResp : []);
    const allNotes = notesResp?.notes || [];
    const knowledgeNotes = allNotes.filter((n) => n.status && n.created).sort((a, b) => b.created.localeCompare(a.created)).slice(0, 5);
    const contextLines = ["Lore dashboard: http://localhost:37778"];
    if (suggestions.length > 0) {
      contextLines.push("");
      contextLines.push(formatSuggestions(suggestions));
    }
    if (knowledgeNotes.length > 0) {
      contextLines.push("");
      contextLines.push("## Recent Vault Notes");
      for (const n of knowledgeNotes) {
        contextLines.push(`- **${n.title}** (${n.status}, ${n.created}) [${n.tags.join(", ")}]`);
      }
    }
    const displayLines = [`Lore dashboard: http://localhost:37778 | ${allNotes.length} vault notes`];
    if (suggestions.length > 0) {
      displayLines.push(`${suggestions.length} pending suggestion${suggestions.length > 1 ? "s" : ""} \u2014 use /vault-note to capture`);
    }
    if (knowledgeNotes.length > 0) {
      displayLines.push("");
      displayLines.push("Recent:");
      for (const n of knowledgeNotes) {
        const tags = n.tags.length > 0 ? ` [${n.tags.join(", ")}]` : "";
        displayLines.push(`  ${n.status === "promoted" ? "\u2713" : "\u25CB"} ${n.title}${tags}`);
      }
    }
    output({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: contextLines.join("\n")
      },
      systemMessage: displayLines.join("\n")
    });
  } catch (err) {
    writeHookStatus("SessionStart", { lastFiredAt: Date.now(), success: false, error: String(err) });
    output({});
  }
}
main();
