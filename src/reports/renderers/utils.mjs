/**
 * @file utils.mjs
 * @description Shared formatting and string manipulation utilities for report generation.
 * Includes HTML escaping, multiline formatting, and automatic URL linkification.
 */

/**
 * Escapes special HTML characters in a string to prevent XSS and ensure proper rendering.
 * @param {string} value - The raw string to escape.
 * @returns {string} The HTML-escaped string.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Formats a multiline string for display in HTML by escaping it and converting newlines to <br> tags.
 * @param {string} value - The multiline text to format.
 * @returns {string} The formatted HTML string.
 */
export function formatMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

/**
 * Identifies URLs in a text string and converts them into clickable <a> anchor tags.
 * Optimized for Tailwind-based or similar styling contexts.
 * @param {string} text - The text containing potential URLs.
 * @returns {string} The text with URLs converted to HTML links.
 */
export function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(
    urlRegex,
    '<a href="$1" target="_blank" class="text-indigo-600 hover:underline font-medium break-all">$1</a>',
  );
}
