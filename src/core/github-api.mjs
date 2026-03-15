/**
 * @file github-api.mjs
 * @description Minimal GitHub API client for reading repository content without cloning.
 * Used by the engine to fetch package.json for stack detection and source files for
 * pattern scanning and AI enrichment.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";

/**
 * Parses a GitHub URL into owner and repo components.
 * @param {string} repoUrl
 * @returns {{ owner: string, repo: string, branch: string } | null}
 */
export function parseRepoUrl(repoUrl) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    const [owner, repo, , branch] = parts;
    return { owner, repo, branch: branch || "main" };
  } catch {
    return null;
  }
}

/**
 * Builds Authorization header if token is present.
 * @param {string|undefined} token
 * @returns {Record<string, string>}
 */
function authHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * Fetches and parses package.json from a GitHub repository.
 * Tries the default branch first, then falls back to 'master'.
 *
 * @param {string} repoUrl
 * @param {string|undefined} token
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function fetchPackageJson(repoUrl, token) {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;

  const { owner, repo, branch } = parsed;
  const branches = [branch, branch === "main" ? "master" : "main"];

  for (const b of branches) {
    try {
      const url = `${GITHUB_RAW}/${owner}/${repo}/${b}/package.json`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const text = await res.text();
        return JSON.parse(text);
      }
    } catch {
      // try next branch
    }
  }

  return null;
}

/**
 * Fetches a file from a GitHub repository.
 * Returns the raw file content as a string.
 *
 * @param {string} repoUrl
 * @param {string} filePath - Relative path within the repo (e.g. "src/components/Header.tsx")
 * @param {string|undefined} token
 * @returns {Promise<string | null>}
 */
export async function fetchRepoFile(repoUrl, filePath, token) {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;

  const { owner, repo, branch } = parsed;
  const branches = [branch, branch === "main" ? "master" : "main"];

  for (const b of branches) {
    try {
      const url = `${GITHUB_RAW}/${owner}/${repo}/${b}/${filePath}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) return await res.text();
    } catch {
      // try next branch
    }
  }

  return null;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "coverage", ".cache", "out", ".turbo", ".vercel", ".netlify",
  "public", "static", "wp-includes", "wp-admin",
]);

// Common source root directories to walk when the Trees API is truncated.
const FALLBACK_SOURCE_DIRS = [
  "src", "app", "pages", "components", "lib", "utils", "hooks",
];

/**
 * Filters a flat list of tree items to only matching files.
 * @param {Array<{type: string, path: string}>} tree
 * @param {Set<string>} extSet
 * @returns {string[]}
 */
function filterTree(tree, extSet) {
  return tree
    .filter((item) => {
      if (item.type !== "blob") return false;
      const parts = item.path.split("/");
      if (parts.some((p) => SKIP_DIRS.has(p) || p.startsWith("."))) return false;
      const ext = item.path.slice(item.path.lastIndexOf(".")).toLowerCase();
      return extSet.has(ext);
    })
    .map((item) => item.path);
}

/**
 * Recursively lists files in a directory using the GitHub Contents API.
 * Used as fallback when the Trees API returns a truncated response.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} dir
 * @param {Set<string>} extSet
 * @param {Record<string, string>} headers
 * @param {number} depth
 * @returns {Promise<string[]>}
 */
async function walkContentsApi(owner, repo, branch, dir, extSet, headers, depth = 0) {
  if (depth > 6) return [];

  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${dir}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];

    const items = await res.json();
    if (!Array.isArray(items)) return [];

    const files = [];
    const subdirPromises = [];

    for (const item of items) {
      if (item.type === "file") {
        const ext = item.path.slice(item.path.lastIndexOf(".")).toLowerCase();
        if (extSet.has(ext)) files.push(item.path);
      } else if (item.type === "dir") {
        const name = item.name;
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) {
          subdirPromises.push(
            walkContentsApi(owner, repo, branch, item.path, extSet, headers, depth + 1)
          );
        }
      }
    }

    const nested = await Promise.all(subdirPromises);
    return [...files, ...nested.flat()];
  } catch {
    return [];
  }
}

/**
 * Lists files in a repository directory using the GitHub Trees API.
 * Falls back to the Contents API for each common source directory if
 * the Trees API response is truncated (large monorepos).
 * Returns file paths matching the given extensions.
 *
 * @param {string} repoUrl
 * @param {string[]} extensions - e.g. [".tsx", ".jsx", ".html"]
 * @param {string|undefined} token
 * @returns {Promise<string[]>}
 */
export async function listRepoFiles(repoUrl, extensions, token) {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return [];

  const { owner, repo, branch } = parsed;
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));
  const headers = authHeaders(token);

  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data.tree)) return [];

    if (!data.truncated) {
      return filterTree(data.tree, extSet);
    }

    // Trees API truncated — fall back to Contents API for common source dirs
    const results = await Promise.all(
      FALLBACK_SOURCE_DIRS.map((dir) =>
        walkContentsApi(owner, repo, branch, dir, extSet, headers)
      )
    );

    return [...new Set(results.flat())];
  } catch {
    return [];
  }
}
