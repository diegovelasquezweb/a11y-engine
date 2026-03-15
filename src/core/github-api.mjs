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

/**
 * Lists files in a repository directory using the GitHub Trees API.
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

  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(url, { headers: authHeaders(token) });
    if (!res.ok) return [];

    const { tree } = await res.json();
    if (!Array.isArray(tree)) return [];

    const extSet = new Set(extensions.map((e) => e.toLowerCase()));
    const skipDirs = new Set([
      "node_modules", ".git", "dist", "build", ".next", ".nuxt",
      "coverage", ".cache", "out", ".turbo", ".vercel", ".netlify",
      "public", "static", "wp-includes", "wp-admin",
    ]);

    return tree
      .filter((item) => {
        if (item.type !== "blob") return false;
        const path = item.path;
        const parts = path.split("/");
        if (parts.some((p) => skipDirs.has(p) || p.startsWith("."))) return false;
        const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
        return extSet.has(ext);
      })
      .map((item) => item.path);
  } catch {
    return [];
  }
}
