// App state + persistence.
// Every change is written to localStorage immediately (works offline, instant).
// In GitHub mode, changes are also committed to a JSON file in your repo a moment
// after you stop typing, so every device you use sees the same data.

import * as gh from './github.js';
import { nowISO } from './util.js';

const KEY = { data: 'rt:data', meta: 'rt:meta', cfg: 'rt:config', base: 'rt:base' };
const COLLECTIONS = ['projects', 'presentations', 'ideas', 'tasks', 'timelog'];

export const emptyData = () => ({
  version: 1, updatedAt: null, projects: [], presentations: [], ideas: [], tasks: [], timelog: [], timer: null,
});

export function normalize(d) {
  const out = { ...emptyData(), ...(d && typeof d === 'object' ? d : {}) };
  for (const k of COLLECTIONS) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

/**
 * Three-way merge used when this device and GitHub both changed since the last sync
 * (e.g. you edited on your phone while offline). Works item-by-item: edits on both
 * sides are kept; if the same item was edited on both, the most recent edit wins.
 */
export function merge(base, local, remote) {
  base = normalize(base); local = normalize(local); remote = normalize(remote);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = { ...remote };
  for (const k of COLLECTIONS) {
    const B = new Map(base[k].map((x) => [x.id, x]));
    const L = new Map(local[k].map((x) => [x.id, x]));
    const R = new Map(remote[k].map((x) => [x.id, x]));
    const pick = (id) => {
      const b = B.get(id), l = L.get(id), r = R.get(id);
      if (!b) return l && r ? ((l.updatedAt || '') > (r.updatedAt || '') ? l : r) : l || r; // new on one/both sides
      if (!l) return r && !same(r, b) ? r : null; // deleted here (keep if edited remotely)
      if (!r) return !same(l, b) ? l : null; // deleted remotely (keep if edited here)
      if (same(l, b)) return r;
      if (same(r, b)) return l;
      return (l.updatedAt || '') > (r.updatedAt || '') ? l : r;
    };
    const order = [...remote[k].map((x) => x.id), ...local[k].map((x) => x.id).filter((id) => !R.has(id))];
    out[k] = order.map(pick).filter(Boolean);
  }
  out.timer = same(local.timer, base.timer) ? remote.timer : local.timer;
  out.updatedAt = nowISO();
  return out;
}

export const hasContent = (d) => !!d && COLLECTIONS.some((k) => d[k]?.length);

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error('localStorage write failed', e); }
};

class Store {
  constructor() {
    this.cfg = read(KEY.cfg, null); // { mode: 'local' | 'github', owner, repo, branch, path, token }
    this.meta = read(KEY.meta, { dirty: false, sha: null, lastSync: null });
    const cached = read(KEY.data, null);
    this.state = cached ? normalize(cached) : null; // null => first run (show welcome screen)
    this.status = { state: this.isGitHub ? 'idle' : 'local', message: '' };
    this.conflict = null;
    this.listeners = new Set();
    this.rev = 0;
    this.pushTimer = null;
    this.pushing = null;
    this.lastPull = 0;
  }

  get isGitHub() {
    return this.cfg?.mode === 'github' && !!this.cfg.token;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(kind, info = {}) {
    for (const fn of this.listeners) fn(kind, info);
  }
  setStatus(state, message = '') {
    this.status = { state, message };
    this.emit('status');
  }

  saveConfig(cfg) {
    this.cfg = cfg;
    write(KEY.cfg, cfg);
  }
  saveMeta() {
    write(KEY.meta, this.meta);
  }

  /** Apply a change. `fn` mutates the state in place. */
  update(fn) {
    fn(this.state);
    this.state.updatedAt = nowISO();
    this.rev++;
    write(KEY.data, this.state);
    this.meta.dirty = true;
    this.saveMeta();
    this.emit('data');
    this.schedulePush();
  }

  /** Replace everything (import / first run). */
  replace(data) {
    this.state = normalize(data);
    this.state.updatedAt = nowISO();
    this.rev++;
    write(KEY.data, this.state);
    this.meta.dirty = true;
    this.saveMeta();
    this.emit('data');
    this.schedulePush(200);
  }

  schedulePush(delay = 1500) {
    if (!this.isGitHub) return this.setStatus('local');
    if (this.status.state === 'conflict') return;
    clearTimeout(this.pushTimer);
    if (this.status.state !== 'saving') this.setStatus('pending');
    this.pushTimer = setTimeout(() => this.push(), delay);
  }

  async push() {
    clearTimeout(this.pushTimer);
    if (!this.isGitHub || !this.meta.dirty || this.status.state === 'conflict') return;
    if (this.pushing) {
      this.pushAgain = true;
      return this.pushing;
    }
    const rev = this.rev;
    this.setStatus('saving');
    this.pushing = (async () => {
      try {
        const text = JSON.stringify(this.state, null, 2) + '\n';
        const sha = await gh.putFile(this.cfg, text, this.meta.sha, `Update research tracker`);
        this.meta.sha = sha;
        this.meta.lastSync = nowISO();
        write(KEY.base, JSON.parse(text));
        if (this.rev === rev) this.meta.dirty = false;
        this.saveMeta();
        this.setStatus(this.meta.dirty ? 'pending' : 'synced');
      } catch (e) {
        if (e.status === 409 || e.status === 422) {
          // Someone (another device) changed the file since we last saw it.
          this.pushing = null;
          await this.pull({ force: true });
        } else {
          this.setStatus(e.status === 0 && !navigator.onLine ? 'offline' : 'error', e.message);
        }
      } finally {
        this.pushing = null;
      }
      if (this.pushAgain || (this.meta.dirty && this.status.state === 'pending')) {
        this.pushAgain = false;
        this.schedulePush(400);
      }
    })();
    return this.pushing;
  }

  /** Fetch the latest file from GitHub and reconcile with local changes. */
  async pull({ silent = false, force = false } = {}) {
    if (!this.isGitHub || this.pushing) return;
    if (!force && silent && Date.now() - this.lastPull < 20000) return;
    this.lastPull = Date.now();
    if (!silent) this.setStatus('syncing');
    try {
      const remote = await gh.getFile(this.cfg);
      if (!remote) {
        // File doesn't exist yet: create it from what we have.
        if (!this.state) this.state = normalize(null);
        this.meta.sha = null;
        this.meta.dirty = true;
        this.saveMeta();
        return this.push();
      }
      if (remote.sha === this.meta.sha) {
        try { write(KEY.base, JSON.parse(remote.text)); } catch {} // GitHub copy == our last-synced base
        if (this.meta.dirty) return this.push();
        return this.setStatus('synced');
      }
      if (this.meta.dirty && this.state) {
        const base = read(KEY.base, null);
        let remoteData = null;
        try { remoteData = JSON.parse(remote.text); } catch {}
        if (base && remoteData) {
          this.state = normalize(merge(base, this.state, remoteData));
          write(KEY.data, this.state);
          write(KEY.base, remoteData);
          this.meta.sha = remote.sha;
          this.saveMeta();
          this.rev++;
          this.emit('data', { remote: true });
          this.emit('merged');
          return this.push();
        }
        this.conflict = { remote };
        return this.setStatus('conflict', 'This device and GitHub both have changes.');
      }
      this.applyRemote(remote);
    } catch (e) {
      this.setStatus(e.status === 0 && !navigator.onLine ? 'offline' : 'error', e.message);
    }
  }

  applyRemote(remote) {
    let data;
    try {
      data = JSON.parse(remote.text);
    } catch {
      return this.setStatus('error', `${this.cfg.path} on GitHub isn't valid JSON.`);
    }
    this.state = normalize(data);
    write(KEY.data, this.state);
    write(KEY.base, data);
    this.meta = { dirty: false, sha: remote.sha, lastSync: nowISO() };
    this.saveMeta();
    this.setStatus('synced');
    this.emit('data', { remote: true });
  }

  resolveConflict(keep) {
    const { remote } = this.conflict || {};
    this.conflict = null;
    if (!remote) return;
    if (keep === 'remote') return this.applyRemote(remote);
    this.meta.sha = remote.sha; // overwrite GitHub with this device's copy
    localStorage.removeItem(KEY.base);
    this.meta.dirty = true;
    this.saveMeta();
    this.status = { state: 'pending', message: '' };
    this.push();
  }

  /** Connect to GitHub. Returns { remote } so the caller can decide what to do if both sides have data. */
  async connect(cfg) {
    await gh.checkRepo(cfg);
    const remote = await gh.getFile(cfg);
    return { remote };
  }

  finishConnect(cfg, { remote, keep }) {
    this.saveConfig({ ...cfg, mode: 'github' });
    this.conflict = null;
    if (remote && keep === 'remote') return this.applyRemote(remote);
    this.meta = { dirty: true, sha: remote?.sha || null, lastSync: null };
    localStorage.removeItem(KEY.base);
    if (!this.state) this.state = normalize(null);
    write(KEY.data, this.state);
    this.saveMeta();
    this.emit('data');
    this.push();
  }

  disconnect() {
    this.saveConfig({ mode: 'local' });
    localStorage.removeItem(KEY.base);
    this.meta = { dirty: false, sha: null, lastSync: null };
    this.saveMeta();
    this.setStatus('local');
  }

  useLocal(data) {
    this.saveConfig({ mode: 'local' });
    this.replace(data || normalize(null));
  }

  resetDevice() {
    for (const k of Object.values(KEY)) localStorage.removeItem(k);
    location.reload();
  }
}

export const store = new Store();

// Keep devices in step: re-check GitHub when you come back to the tab,
// and flush pending changes when you leave it.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (store.meta.dirty) store.push();
  } else if (!store.meta.dirty) {
    store.pull({ silent: true });
  }
});
window.addEventListener('online', () => store.isGitHub && store.pull({ force: true, silent: true }));
