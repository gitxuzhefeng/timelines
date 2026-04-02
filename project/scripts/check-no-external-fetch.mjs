#!/usr/bin/env node
/**
 * M4-07 半自动化：扫描前端源码是否引入公网请求 API（仅启发式）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const BAD = [/\bfetch\s*\(/, /\baxios\b/, /XMLHttpRequest/];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name.name)) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of BAD) {
    if (re.test(text)) {
      console.error(`[check-no-external-fetch] ${path.relative(srcRoot, file)} matched ${re}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\n若确认为误报，请收窄正则或改为白名单目录。");
  process.exit(1);
}
console.log("check-no-external-fetch: OK (no fetch/axios/http URL patterns in src/)");
