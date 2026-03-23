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

// src/hooks/user-prompt-submit.ts
var fs = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);

// src/hooks/utils.ts
async function readStdin() {
  return new Promise((resolve2) => {
    if (process.stdin.isTTY) {
      resolve2({});
      return;
    }
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      try {
        resolve2(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve2({});
      }
    });
    process.stdin.on("error", () => resolve2({}));
    setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve2(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString()) : {});
    }, 3e3);
  });
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

// src/hooks/user-prompt-submit.ts
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "is",
  "a",
  "an",
  "to",
  "in",
  "for",
  "of",
  "and",
  "or",
  "but",
  "with",
  "this",
  "that",
  "it",
  "my",
  "be",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "not",
  "no",
  "can",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "shall",
  "how",
  "what",
  "when",
  "where",
  "who",
  "why",
  "which",
  "there",
  "here",
  "all",
  "each",
  "any",
  "some",
  "one",
  "two",
  "from",
  "about",
  "into",
  "over",
  "after",
  "before",
  "just",
  "than",
  "then",
  "also",
  "very",
  "too",
  "only",
  "own",
  "same",
  "so",
  "up",
  "out",
  "on",
  "off",
  "if",
  "its",
  "our",
  "your",
  "his",
  "her",
  "we",
  "he",
  "she",
  "they",
  "me",
  "him",
  "them",
  "you",
  "been",
  "being"
]);
var SKIP_NAMES = /* @__PURE__ */ new Set(["README.md", ".vault-mcp.json"]);
var SKIP_DIRS = /* @__PURE__ */ new Set([".obsidian"]);
function extractKeywords(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 5);
}
function parseFrontmatter(content) {
  const result = { title: "", status: "", project: "", body: content };
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return result;
  const fm = fmMatch[1];
  result.body = fmMatch[2];
  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
  const statusMatch = fm.match(/^status:\s*(.+)$/m);
  if (statusMatch) result.status = statusMatch[1].trim();
  const projectMatch = fm.match(/^project:\s*(.+)$/m);
  if (projectMatch) result.project = projectMatch[1].trim();
  return result;
}
function collectMdFiles(dir, files = [], depth = 0) {
  if (depth > 5) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectMdFiles(fullPath, files, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".md") && !SKIP_NAMES.has(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
  }
  return files;
}
function formatMatches(matches) {
  const lines = [
    "## Relevant Vault Knowledge",
    "",
    "The following established team knowledge may be relevant to your task:",
    ""
  ];
  for (const m of matches) {
    lines.push(`### [[${m.title}]]`);
    lines.push(`Status: ${m.status}${m.project ? ` | Project: ${m.project}` : ""}`);
    lines.push(`> ${m.excerpt}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}
async function main() {
  const deadline = Date.now() + 2e3;
  try {
    writeHookStatus("UserPromptSubmit", { lastFiredAt: Date.now(), success: true });
    const input = await readStdin();
    const promptText = input.input || input.prompt || "";
    if (!promptText || typeof promptText !== "string") {
      output({});
    }
    const vaultPath = resolveVaultForProject(process.cwd());
    if (!vaultPath) {
      output({});
    }
    const keywords = extractKeywords(promptText);
    if (keywords.length === 0) {
      output({});
    }
    const mdFiles = collectMdFiles(vaultPath);
    const matches = [];
    for (const filePath of mdFiles) {
      if (Date.now() > deadline) break;
      if (matches.length >= 3) break;
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const contentLower = content.toLowerCase();
        const hasMatch = keywords.some((kw) => contentLower.includes(kw));
        if (!hasMatch) continue;
        const parsed = parseFrontmatter(content);
        if (parsed.status !== "established") continue;
        const title = parsed.title || path.basename(filePath, ".md");
        const excerpt = parsed.body.trim().slice(0, 200);
        matches.push({
          title,
          status: parsed.status,
          project: parsed.project,
          excerpt
        });
      } catch {
      }
    }
    if (matches.length > 0) {
      output({
        hookSpecificOutput: {
          additionalContext: formatMatches(matches)
        }
      });
    }
    output({});
  } catch (err) {
    writeHookStatus("UserPromptSubmit", { lastFiredAt: Date.now(), success: false, error: String(err) });
    output({});
  }
}
main();
