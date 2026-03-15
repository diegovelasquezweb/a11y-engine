#!/usr/bin/env node
/**
 * sync-assets.mjs
 * Generates assets/generated/**\/*.mjs from assets/source/**\/*.json.
 * Run: node src/sync-assets.mjs
 * Hooked automatically in prepublishOnly.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "assets", "source");
const GENERATED_DIR = path.join(ROOT, "assets", "generated");

let synced = 0;
let skipped = 0;

function syncDir(sourceDir, generatedDir) {
  fs.mkdirSync(generatedDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const generatedPath = path.join(generatedDir, entry.name);

    if (entry.isDirectory()) {
      syncDir(sourcePath, path.join(generatedDir, entry.name));
      continue;
    }

    if (!entry.name.endsWith(".json")) {
      skipped++;
      continue;
    }

    const mjsName = entry.name.replace(/\.json$/, ".mjs");
    const mjsPath = path.join(generatedDir, mjsName);

    let data;
    try {
      data = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    } catch (err) {
      console.error(`  [ERROR] Failed to parse ${sourcePath}: ${err.message}`);
      process.exit(1);
    }

    const content = `export default ${JSON.stringify(data)};\n`;

    let existing = null;
    try { existing = fs.readFileSync(mjsPath, "utf-8"); } catch { /* new file */ }

    if (existing !== content) {
      fs.writeFileSync(mjsPath, content, "utf-8");
      console.log(`  synced: ${path.relative(ROOT, mjsPath)}`);
      synced++;
    } else {
      skipped++;
    }
  }
}

console.log("Syncing assets/source/*.json → assets/generated/*.mjs");
syncDir(SOURCE_DIR, GENERATED_DIR);
console.log(`Done. ${synced} file(s) written, ${skipped} unchanged/skipped.`);
