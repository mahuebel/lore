#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/hooks/utils.ts
var utils_exports = {};
__export(utils_exports, {
  daemonRequest: () => daemonRequest,
  output: () => output,
  readStdin: () => readStdin
});
module.exports = __toCommonJS(utils_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  daemonRequest,
  output,
  readStdin
});
