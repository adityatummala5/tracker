// Minimal GitHub "contents" API client used to read/write the tracker JSON file.
// Docs: https://docs.github.com/en/rest/repos/contents

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const headers = (cfg) => ({
  Authorization: `Bearer ${cfg.token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});
const repoUrl = (cfg) => `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
const fileUrl = (cfg) => `${repoUrl(cfg)}/contents/${cfg.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;

function friendly(status, msg) {
  if (status === 401) return 'GitHub rejected the token (expired or mistyped?).';
  if (status === 403) return /rate limit/i.test(msg) ? 'GitHub rate limit hit, try again in a minute.' : "The token doesn't have permission. It needs Contents: Read and write on this repo.";
  if (status === 404) return 'Repository not found, or the token has no access to it.';
  return msg || `GitHub error ${status}`;
}

async function request(url, cfg, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { ...headers(cfg), ...(init.headers || {}) }, cache: 'no-store' });
  } catch {
    throw new GitHubError(0, navigator.onLine ? "Couldn't reach GitHub." : "You're offline. Changes are saved on this device and will sync later.");
  }
  if (res.ok) return res.json();
  let msg = res.statusText;
  try { msg = (await res.json()).message || msg; } catch {}
  throw new GitHubError(res.status, res.status === 409 || res.status === 422 ? msg : friendly(res.status, msg));
}

/** Confirms the repo exists and the token can see it. Returns repo metadata. */
export async function checkRepo(cfg) {
  const repo = await request(repoUrl(cfg), cfg);
  return { private: repo.private, defaultBranch: repo.default_branch, canPush: repo.permissions?.push !== false };
}

/** Returns { text, sha } or null if the file doesn't exist yet. */
export async function getFile(cfg) {
  let j;
  try {
    j = await request(`${fileUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, cfg);
  } catch (e) {
    if (e.status === 404) {
      await checkRepo(cfg); // throws a clear error if it's the repo (not the file) that's missing
      return null;
    }
    throw e;
  }
  if (Array.isArray(j)) throw new GitHubError(400, `"${cfg.path}" is a folder, not a file.`);
  if (j.content) return { text: b64decode(j.content), sha: j.sha };
  // Files over 1 MB come back without inline content; fetch the blob instead.
  const blob = await request(j.git_url, cfg);
  return { text: b64decode(blob.content), sha: j.sha };
}

/** Creates or updates the file. Returns the new sha. */
export async function putFile(cfg, text, sha, message) {
  const body = JSON.stringify({ message, content: b64encode(text), branch: cfg.branch, ...(sha ? { sha } : {}) });
  const j = await request(fileUrl(cfg), cfg, { method: 'PUT', body, keepalive: body.length < 60000 });
  return j.content.sha;
}
