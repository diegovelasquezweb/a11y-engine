/**
 * @file utils.mjs
 * @description Core utility functions and shared configuration for the a11y skill.
 * Provides logging, file I/O operations, and path management used throughout the audit pipeline.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The absolute root directory of the a11y skill project.
 * @type {string}
 */
export const SKILL_ROOT = path.join(__dirname, "..", "..");

/**
 * Default configuration values for the accessibility audit scanner.
 * Used when specific options are not provided via CLI or config file.
 * @type {Object}
 */
export const DEFAULTS = {
  maxRoutes: 10,
  crawlDepth: 2,
  complianceTarget: "WCAG 2.2 AA",
  colorScheme: "light",
  viewports: [{ width: 1280, height: 800, name: "Desktop" }],
  headless: true,
  waitMs: 2000,
  timeoutMs: 30000,
  waitUntil: "domcontentloaded",
};

/**
 * Standardized logging utility for consistent terminal output across scripts.
 * Supports info, success, warning, and error levels with ANSI color coding.
 */
export const log = {
  /**
   * Logs an informational message in cyan.
   * @param {string} msg - The message to log.
   */
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  /**
   * Logs a success message in green.
   * @param {string} msg - The message to log.
   */
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  /**
   * Logs a warning message in yellow.
   * @param {string} msg - The message to log.
   */
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  /**
   * Logs an error message in red, optionally including a troubleshooting hint.
   * @param {string} msg - The error message.
   * @param {string} [hint=""] - An optional hint or troubleshooting suggestion.
   */
  error: (msg, hint = "") => {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
    if (hint) {
      console.log(`\x1b[35m[TROUBLESHOOTING]\x1b[0m ${hint}`);
    }
  },
};

/**
 * Writes data to a JSON file, creating parent directories if they don't exist.
 * @param {string} filePath - Absolute path to the destination file.
 * @param {any} data - The data to serialize (will be formatted with 2-space indentation).
 */
export function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Reads and parses a JSON file.
 * @param {string} filePath - Absolute path to the JSON file.
 * @returns {any|null} The parsed data or null if the file doesn't exist or is invalid.
 */
export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    log.error(`Failed to read JSON from ${filePath}: ${e.message}`);
    return null;
  }
}

/**
 * Constructs an absolute path to a file within the internal audit directory.
 * @param {string} filename - The name of the file.
 * @returns {string} The resolved absolute path.
 */
export function getInternalPath(filename) {
  return path.join(SKILL_ROOT, ".audit", filename);
}
