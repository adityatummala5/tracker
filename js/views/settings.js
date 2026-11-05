import { esc, timeAgo, download, toCSV, todayISO, fmtDate } from '../util.js';
import { store, hasContent, normalize } from '../store.js';
import { stage, presStatus, projectTitle, entryMinutes } from '../model.js';
import { icon, toast, choose } from '../ui.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function ghForm(cfg = {}, { compact = false } = {}) {
  const c = { owner: '', repo: '', branch: 'main', path: 'data/tracker.json', token: '', ...cfg };
  return `<form class="gh-form" data-form="github" autocomplete="off">
    <div class="grid2">
      <label class="field"><span class="field-label">GitHub username</span><input name="owner" value="${esc(c.owner)}" placeholder="your-username" required></label>
      <label class="field"><span class="field-label">Repository</span><input name="repo" value="${esc(c.repo)}" placeholder="research-tracker" required></label>
      ${compact ? '' : `<label class="field"><span class="field-label">Branch</span><input name="branch" value="${esc(c.branch)}"></label>
      <label class="field"><span class="field-label">Data file path</span><input name="path" value="${esc(c.path)}"></label>`}
      <label class="field wide"><span class="field-label">Access token</span><input name="token" type="password" value="${esc(c.token)}" placeholder="github_pat_…" required></label>
    </div>
    ${compact ? `<input type="hidden" name="branch" value="${esc(c.branch)}"><input type="hidden" name="path" value="${esc(c.path)}">` : ''}
    <details class="help"><summary>How do I get a token? (2 minutes, once per device)</summary>
      <ol>
        <li>Open <a href="${TOKEN_URL}" target="_blank" rel="noopener">GitHub → Fine-grained token</a>.</li>
        <li>Name it “Research tracker”, set an expiration (e.g. 1 year).</li>
        <li><b>Repository access</b> → Only select repositories → pick your tracker repo.</li>
        <li><b>Permissions</b> → Repository → <b>Contents: Read and write</b>. Nothing else.</li>
        <li>Generate, copy, and paste it here. It's stored only in this browser.</li>
      </ol></details>
    <div class="form-actions"><button class="btn primary" type="submit">${icon('cloud')}Connect & sync</button><span class="form-msg muted small" data-msg></span></div>
  </form>`;
}

/** Handles the GitHub connect form (used by Welcome and Settings). */
export async function submitGitHub(form) {
  const fd = new FormData(form);
  const cfg = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
  cfg.branch ||= 'main';
  cfg.path ||= 'data/tracker.json';
  const msg = form.querySelector('[data-msg]');
  const btn = form.querySelector('button[type=submit]');
  msg.textContent = 'Connecting…';
  msg.className = 'form-msg muted small';
  btn.disabled = true;
  try {
    const { remote } = await store.connect(cfg);
    let keep = 'remote';
    if (!remote) keep = 'local';
    else if (hasContent(store.state)) {
      let remoteData = null;
      try { remoteData = normalize(JSON.parse(remote.text)); } catch {}
      const same = remoteData && JSON.stringify({ ...remoteData, updatedAt: 0 }) === JSON.stringify({ ...store.state, updatedAt: 0 });
      if (!same) {
        keep = await choose({
          title: 'Which data should we keep?',
          body: `<p>GitHub already has a tracker file${remoteData ? ` (${remoteData.projects.length} projects, ${remoteData.presentations.length} presentations)` : ''}, and this browser has its own data (${store.state.projects.length} projects, ${store.state.presentations.length} presentations).</p>`,
          buttons: [
            { label: 'Cancel', value: '' },
            { label: 'Replace GitHub with this browser', value: 'local', danger: true },
            { label: 'Use GitHub data', value: 'remote', primary: true },
          ],
        });
        if (!keep) throw new Error('Cancelled.');
      }
    }
    store.finishConnect(cfg, { remote, keep });
    toast('Connected to GitHub');
    location.hash = '#/';
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'form-msg error small';
  } finally {
    btn.disabled = false;
  }
}

export function renderWelcome() {
  return `<div class="welcome"><div class="welcome-card">
    <div class="brand big"><span class="logo">R</span>Research Tracker</div>
    <p class="lead">Projects, manuscripts, presentations, ideas, tasks and hours in one place.</p>
    <div class="welcome-opts">
      <section class="card"><h2>${icon('cloud')}Sync with GitHub <span class="badge tone-green">Recommended</span></h2>
        <p class="muted small">Your data lives in a JSON file in your <b>private</b> repo, so it stays in sync across your laptop and phone and keeps a full history.</p>
        ${ghForm({}, { compact: true })}</section>
      <section class="card alt"><h2>${icon('home')}Just this browser</h2>
        <p class="muted small">Start right away. Data stays on this device (export a backup anytime). You can connect GitHub later in Settings.</p>
        <div class="row-actions"><button class="btn" data-act="start-local">Start empty</button>
        <label class="btn">${icon('upload')}Import backup (.json)<input type="file" accept=".json,application/json" data-import hidden></label></div></section>
    </div></div></div>`;
}

export function render(s) {
  const cfg = store.cfg || {};
  const gh = store.isGitHub;
  return `
  <header class="page-head"><div><h1>Settings</h1><p class="muted">Sync, backups and data</p></div></header>
  <section class="card"><div class="card-head"><h2>${icon('cloud')}Sync</h2>${gh ? '<span class="badge tone-green">GitHub</span>' : '<span class="badge tone-gray">This browser only</span>'}</div>
    ${gh ? `<p>Syncing to <a href="https://github.com/${esc(cfg.owner)}/${esc(cfg.repo)}/blob/${esc(cfg.branch)}/${esc(cfg.path)}" target="_blank" rel="noopener"><b>${esc(cfg.owner)}/${esc(cfg.repo)}</b> · ${esc(cfg.path)}</a>.
        Last synced ${store.meta.lastSync ? timeAgo(store.meta.lastSync) : 'never'}.
        <a href="https://github.com/${esc(cfg.owner)}/${esc(cfg.repo)}/commits/${esc(cfg.branch)}/${esc(cfg.path)}" target="_blank" rel="noopener">View history</a></p>
      <div class="row-actions"><button class="btn" data-act="sync-now">Sync now</button><button class="btn ghost danger" data-act="disconnect">Disconnect this device</button></div>
      <details class="help"><summary>Change repository or token</summary>${ghForm(cfg)}</details>`
    : `<p class="muted">Connect a private GitHub repo to sync between devices and keep version history.</p>${ghForm(cfg)}`}
  </section>
  <section class="card"><div class="card-head"><h2>${icon('download')}Backup & export</h2></div>
    <div class="row-actions">
      <button class="btn" data-act="export-json">Full backup (.json)</button>
      <button class="btn" data-act="export-projects">Projects (.csv)</button>
      <button class="btn" data-act="export-pres">Presentations (.csv)</button>
      <button class="btn" data-act="export-time">Time log (.csv)</button>
    </div>
    <p class="muted small">CSV files open in Excel / Google Sheets.</p></section>
  <section class="card"><div class="card-head"><h2>${icon('upload')}Import</h2></div>
    <p class="muted small">Restore from a .json backup. This replaces everything currently in the tracker.</p>
    <label class="btn">${icon('upload')}Choose backup file<input type="file" accept=".json,application/json" data-import hidden></label></section>
  <section class="card"><div class="card-head"><h2>Keyboard shortcuts</h2></div>
    <div class="kbd-list"><span><kbd>⌘</kbd><kbd>K</kbd> / <kbd>/</kbd></span>Search everything & quick actions<span><kbd>Esc</kbd></span>Close panel<span><kbd>N</kbd></span>New project<span><kbd>T</kbd></span>New task</div></section>
  <section class="card"><div class="card-head"><h2>Danger zone</h2></div>
    <p class="muted small">Clears this browser's copy (and saved token). ${gh ? 'Your data on GitHub is untouched.' : '<b>Export a backup first</b>: this browser is your only copy.'}</p>
    <button class="btn danger" data-act="reset-device">Reset this device</button></section>
  <p class="muted small center">${s.projects.length} projects · ${s.presentations.length} presentations · ${s.ideas.length} ideas · ${s.tasks.length} tasks · ${s.timelog.length} time entries</p>`;
}

// ---------- exports ----------
const stampName = (n, ext) => `research-${n}-${todayISO()}.${ext}`;
export function exportTime(s) {
  download(stampName('timelog', 'csv'), toCSV(s.timelog.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)), [
    { label: 'Date', get: (e) => e.date }, { label: 'Clock in', get: (e) => e.start }, { label: 'Clock out', get: (e) => e.end },
    { label: 'Hours', get: (e) => (entryMinutes(e) / 60).toFixed(2) }, { label: 'Project', get: (e) => projectTitle(s, e.projectId) }, { label: 'Note', get: (e) => e.note },
  ]), 'text/csv');
}

export async function importFile(file, { welcome = false } = {}) {
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) throw new Error();
  } catch {
    return toast("That file isn't a tracker backup.");
  }
  if (!welcome && hasContent(store.state)) {
    const ok = await choose({ title: 'Replace all data?', body: `<p>This replaces everything with the backup (${data.projects.length} projects, ${(data.presentations || []).length} presentations).</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Replace', value: 'y', danger: true }] });
    if (!ok) return;
  }
  welcome ? store.useLocal(data) : store.replace(data);
  toast('Backup imported');
  location.hash = '#/';
}

export const actions = {
  'export-json': (_, { s }) => download(stampName('tracker', 'json'), JSON.stringify(s, null, 2)),
  'export-projects': (_, { s }) =>
    download(stampName('projects', 'csv'), toCSV(s.projects, [
      { label: 'Title', get: (p) => p.title }, { label: 'Stage', get: (p) => stage(p.stage).label }, { label: 'Journal / venue', get: (p) => p.venue },
      { label: 'Submissions', get: (p) => (p.submissions || []).map((x) => `${x.venue} (${x.outcome}${x.date ? ', ' + x.date : ''})`) },
      { label: 'Waiting on', get: (p) => p.waitingOn }, { label: 'Collaborators', get: (p) => p.collaborators }, { label: 'Authors', get: (p) => p.authors },
      { label: 'Target date', get: (p) => p.dueDate }, { label: 'Tags', get: (p) => p.tags }, { label: 'Links', get: (p) => (p.links || []).map((l) => l.url) }, { label: 'Notes', get: (p) => p.notes },
    ]), 'text/csv'),
  'export-pres': (_, { s }) =>
    download(stampName('presentations', 'csv'), toCSV(s.presentations, [
      { label: 'Title', get: (p) => p.title }, { label: 'Conference', get: (p) => p.conference }, { label: 'Location', get: (p) => p.location },
      { label: 'Date', get: (p) => (p.monthOnly ? fmtDate(p.date, { monthOnly: true }) : p.date) }, { label: 'Type', get: (p) => p.types },
      { label: 'Status', get: (p) => presStatus(p.status).label }, { label: 'Project', get: (p) => projectTitle(s, p.projectId) },
      { label: 'Links', get: (p) => (p.links || []).map((l) => l.url) }, { label: 'Notes', get: (p) => p.notes },
    ]), 'text/csv'),
  'export-time': (_, { s }) => exportTime(s),
  'sync-now': () => store.pull({ force: true }),
  'disconnect': async () => {
    const ok = await choose({ title: 'Disconnect this device?', body: '<p>The token is removed from this browser. Your data stays here and on GitHub.</p>', buttons: [{ label: 'Cancel', value: '' }, { label: 'Disconnect', value: 'y', danger: true }] });
    if (ok) { store.disconnect(); toast('Disconnected'); }
  },
  'reset-device': async () => {
    const ok = await choose({ title: 'Reset this device?', body: `<p>${store.isGitHub ? 'This browser forgets the data and token. GitHub keeps everything.' : '<b>This permanently deletes your data from this browser.</b>'}</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Reset', value: 'y', danger: true }] });
    if (ok) store.resetDevice();
  },
  'start-local': () => { store.useLocal(null); location.hash = '#/'; },
};
