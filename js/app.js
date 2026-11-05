import { store } from './store.js';
import { esc, todayISO, nowHM, nowISO, fmtClock, timeAgo, localISO, minutesBetween } from './util.js';
import { newProject, newPresentation, newIdea, newTask, newTime, projectTitle, openTasks, ACTIVE_STAGES } from './model.js';
import { icon, renderInto, toast, promptForm } from './ui.js';
import * as citations from './citations.js';
import { initDrawer, openDrawer, closeDrawer, isOpen as drawerOpen, refreshIfOpen } from './drawer.js';
import { initPalette, openPalette, paletteOpen } from './palette.js';
import * as dashboard from './views/dashboard.js';
import * as projects from './views/projects.js';
import * as presentations from './views/presentations.js';
import * as ideas from './views/ideas.js';
import * as tasks from './views/tasks.js';
import * as time from './views/time.js';
import * as cv from './views/cv.js';
import * as settings from './views/settings.js';

const VIEWS = { '': dashboard, projects, presentations, ideas, tasks, time, cv, settings };
const NAV = [
  ['', 'Dashboard', 'home'], ['projects', 'Projects', 'projects'], ['presentations', 'Presentations', 'mic'],
  ['ideas', 'Ideas', 'bulb'], ['tasks', 'Tasks', 'checks'], ['time', 'Time log', 'clock'], ['cv', 'CV export', 'cv'], ['settings', 'Settings', 'gear'],
];
const FACTORY = { projects: newProject, presentations: newPresentation, ideas: newIdea, tasks: newTask, timelog: newTime };

const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');

// ---------- small persisted UI prefs (view mode, filters) ----------
let ui = {};
try { ui = JSON.parse(localStorage.getItem('rt:ui') || '{}'); } catch {}
function setUI(patch) {
  ui = { ...ui, ...patch };
  localStorage.setItem('rt:ui', JSON.stringify(ui));
  renderMain();
}

const route = () => {
  const [path, q] = location.hash.replace(/^#\/?/, '').split('?');
  return { name: VIEWS[path] ? path : '', params: new URLSearchParams(q || '') };
};

// ---------- rendering ----------
function syncBadge() {
  const st = store.status.state;
  const map = {
    local: ['gray', 'Saved in this browser'], idle: ['gray', 'Connecting…'], syncing: ['blue', 'Syncing…'],
    pending: ['blue', 'Saving…'], saving: ['blue', 'Saving…'], synced: ['green', 'Synced to GitHub'],
    offline: ['amber', 'Offline · will sync later'], error: ['red', 'Sync problem'], conflict: ['red', 'Sync conflict'],
  };
  const [tone, label] = map[st] || map.local;
  const title = store.status.message || (store.meta.lastSync ? `Last synced ${timeAgo(store.meta.lastSync)}` : '');
  return `<a class="sync tone-${tone}" href="#/settings" title="${esc(title)}"><i class="dot tone-${tone} ${['saving', 'syncing', 'pending'].includes(st) ? 'pulse' : ''}"></i>${label}</a>`;
}

function renderSidebar() {
  const s = store.state;
  if (!s) { sidebar.innerHTML = ''; document.body.classList.add('no-sidebar'); return; }
  document.body.classList.remove('no-sidebar');
  const r = route().name;
  const counts = {
    projects: s.projects.filter((p) => ACTIVE_STAGES.includes(p.stage)).length,
    tasks: openTasks(s).length,
    ideas: s.ideas.length,
  };
  renderInto(sidebar, `
    <a class="brand" href="#/"><span class="logo">R</span><span class="brand-name">Research Tracker</span></a>
    <button class="search-btn" data-act="palette">${icon('search')}<span>Search</span><kbd>⌘K</kbd></button>
    <nav>${NAV.map(([id, label, ic]) => `<a href="#/${id}" class="nav ${r === id ? 'on' : ''}" title="${label}" aria-label="${label}">${icon(ic)}<span>${label}</span>${counts[id] ? `<span class="nav-count">${counts[id]}</span>` : ''}</a>`).join('')}</nav>
    <div class="side-foot">
      ${s.timer ? `<a class="side-timer" href="#/time">${icon('clock')}<span><b data-timer-clock>${fmtClock((Date.now() - new Date(s.timer.startedAt)) / 1000)}</b><span class="clamp1 small">${esc(projectTitle(s, s.timer.projectId) || 'Timer running')}</span></span></a>` : ''}
      ${syncBadge()}
    </div>`);
}

function conflictBanner() {
  if (store.status.state === 'conflict')
    return `<div class="banner danger">${icon('alert')}<span><b>Another device changed your tracker</b> while this one had unsaved edits. Which version should win?</span>
      <button class="btn sm" data-act="resolve" data-v="remote">Use GitHub version</button><button class="btn sm danger" data-act="resolve" data-v="local">Keep this device's</button></div>`;
  if (store.status.state === 'error')
    return `<div class="banner warn">${icon('alert')}<span><b>Couldn't sync:</b> ${esc(store.status.message)} Your changes are safe in this browser.</span><button class="btn sm" data-act="retry">Retry</button><a class="btn sm ghost" href="#/settings">Settings</a></div>`;
  return '';
}

let lastRoute = null;
function renderMain() {
  if (!store.state) {
    renderInto(main, settings.renderWelcome());
    return;
  }
  const r = route();
  const view = VIEWS[r.name];
  renderInto(main, conflictBanner() + view.render(store.state, ui, r.params));
  const key = location.hash;
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
  document.title = `${NAV.find((n) => n[0] === r.name)?.[1] || 'Dashboard'} · Research Tracker`;
}

const renderAll = () => { renderSidebar(); renderMain(); citations.ensure(store.state); };

// ---------- actions ----------
function create(col, preset = {}) {
  const item = FACTORY[col](preset);
  store.update((s) => s[col].push(item));
  openDrawer(col, item.id, { isNew: true });
}

function startTimer(projectId = '') {
  if (store.state.timer) return stopTimer();
  setUI({ lastTimerProject: projectId });
  store.update((s) => { s.timer = { projectId, startedAt: nowISO() }; });
  toast(`Clocked in${projectId ? ` · ${projectTitle(store.state, projectId)}` : ''}`);
  refreshIfOpen();
}

function stopTimer() {
  const t = store.state.timer;
  if (!t) return;
  const start = new Date(t.startedAt);
  const hhmm = (d) => d.toTimeString().slice(0, 5);
  const entry = newTime({ projectId: t.projectId, date: localISO(start), start: hhmm(start), end: nowHM() });
  const mins = minutesBetween(entry.start, entry.end);
  store.update((s) => {
    s.timer = null;
    if (mins >= 1) s.timelog.push(entry);
  });
  toast(mins >= 1 ? `Clocked out · ${Math.floor(mins / 60)}h ${mins % 60}m logged` : 'Timer discarded (under a minute)');
  refreshIfOpen();
}

const ACTIONS = {
  ...projects.actions,
  ...presentations.actions,
  ...tasks.actions,
  ...settings.actions,
  palette: () => openPalette(),
  open: (el) => { const [c, id] = el.dataset.ref.split(':'); openDrawer(c, id); },
  new: (el) => create(el.dataset.col, el.dataset.preset ? JSON.parse(el.dataset.preset) : {}),
  ui: (el) => setUI({ [el.dataset.k]: el.dataset.v }),
  'quick-idea': () => ideas.quickAdd(),
  'promote-idea': (el) => { openDrawer('ideas', el.dataset.id); document.querySelector('#drawer [data-act="promote"]')?.click(); },
  'timer-start': () => startTimer(document.getElementById('timer-proj')?.value || ''),
  'timer-stop': () => stopTimer(),
  'manual-time': () => {
    const v = (id) => document.getElementById(id)?.value || '';
    if (!v('m-start') || !v('m-end')) return toast('Add a clock-in and clock-out time');
    store.update((s) => s.timelog.push(newTime({ date: v('m-date') || todayISO(), start: v('m-start'), end: v('m-end'), projectId: v('m-proj'), note: v('m-note').trim() })));
    setUI({ lastTimerProject: v('m-proj') });
    toast('Time entry added');
  },
  'copy-cv': async () => {
    const node = document.getElementById('cv-out');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([node.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([node.innerText], { type: 'text/plain' }) })]);
    } catch {
      await navigator.clipboard.writeText(node.innerText);
    }
    toast('Copied to clipboard');
  },
  'refresh-cites': () => citations.refresh(store.state, { force: true }),
  'edit-scholar': async () => {
    const sc = store.state.scholar || {};
    const v = await promptForm({
      title: 'Google Scholar numbers',
      body: '<p class="muted small">Copy these from the top-right of your Google Scholar profile ("All" column).</p>',
      fields: [
        { name: 'citations', label: 'Citations', type: 'number', value: sc.citations },
        { name: 'hIndex', label: 'h-index', type: 'number', value: sc.hIndex },
        { name: 'i10', label: 'i10-index', type: 'number', value: sc.i10 },
        { name: 'url', label: 'Profile link (optional)', value: sc.url, placeholder: 'https://scholar.google.com/citations?user=…', wide: true },
      ],
    });
    if (!v) return;
    const n = (x) => (String(x).trim() === '' ? '' : Math.max(0, parseInt(x, 10) || 0));
    store.update((s) => { s.scholar = { citations: n(v.citations), hIndex: n(v.hIndex), i10: n(v.i10), url: v.url.trim(), updatedAt: nowISO() }; });
    toast('Scholar numbers saved');
  },
  resolve: (el) => store.resolveConflict(el.dataset.v),
  retry: () => store.isGitHub && (store.meta.dirty ? store.push() : store.pull({ force: true })),
};
const ctx = () => ({ s: store.state, ui, setUI });

document.addEventListener('click', (e) => {
  if (e.target.closest('#drawer, #modal, #palette')) return;
  if (e.target.closest('a[href]') && e.target.closest('[data-act="open"]')) return; // links inside cards
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, ctx()); }
});

// Keyboard "click" for card-like elements.
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Enter' && t.matches?.('[data-act="open"][tabindex]')) { e.preventDefault(); ACTIONS.open(t); return; }
  if (e.key === 'Enter' && t.dataset?.enter) {
    e.preventDefault();
    if (t.dataset.enter === 'quick-task') {
      tasks.quickAdd(t, route().name === 'tasks' ? ui : {});
    }
    return;
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && t.dataset?.enterMeta === 'quick-idea') { e.preventDefault(); ideas.quickAdd(); return; }

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen() ? null : openPalette(); return; }
  if (e.key === 'Escape') { if (drawerOpen()) { e.preventDefault(); closeDrawer(); } return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || !store.state || drawerOpen() || paletteOpen()) return;
  if (e.key === '/') { e.preventDefault(); openPalette(); }
  else if (e.key === 'n') { e.preventDefault(); create('projects'); }
  else if (e.key === 't') { e.preventDefault(); create('tasks'); }
});

main.addEventListener('input', (e) => {
  const k = e.target.dataset.ui;
  if (k && e.target.tagName === 'INPUT') { ui[k] = e.target.value; localStorage.setItem('rt:ui', JSON.stringify(ui)); renderMain(); }
});
main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.ui && t.tagName === 'SELECT') return setUI({ [t.dataset.ui]: t.value });
  if (t.dataset.actChange === 'cv-review') return setUI({ cvReview: t.checked });
  if (t.matches('[data-import]') && t.files[0]) return settings.importFile(t.files[0], { welcome: !store.state });
});
main.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="github"]');
  if (f) { e.preventDefault(); settings.submitGitHub(f); }
});

window.addEventListener('rt:cites', () => { renderMain(); refreshIfOpen(); });
window.addEventListener('rt:timer', (e) => startTimer(e.detail.projectId));
window.addEventListener('hashchange', () => { if (drawerOpen()) closeDrawer(); renderAll(); });

store.subscribe((kind) => {
  if (kind === 'data') renderAll();
  else if (kind === 'merged') toast('Merged in changes from another device');
  else if (kind === 'status') {
    renderSidebar();
    const st = store.status.state;
    const hadBanner = !!main.querySelector('.banner');
    if (hadBanner || st === 'conflict' || st === 'error' || route().name === 'settings') renderMain();
  }
});

// Live timer display, without re-rendering the whole page.
setInterval(() => {
  const t = store.state?.timer;
  if (!t) return;
  const txt = fmtClock((Date.now() - new Date(t.startedAt)) / 1000);
  document.querySelectorAll('[data-timer-clock]').forEach((n) => (n.textContent = txt));
}, 1000);

// ---------- boot ----------
initDrawer();
initPalette({ open: (c, id) => openDrawer(c, id), create });
projects.initDnD(main);
renderAll();
if (store.isGitHub) store.pull();
