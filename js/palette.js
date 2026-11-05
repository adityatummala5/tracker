// ⌘K / Ctrl+K: search everything and run quick actions.
import { store } from './store.js';
import { esc } from './util.js';
import { stage, presStatus, projectTitle } from './model.js';
import { icon } from './ui.js';

let el, items = [], sel = 0, handlers;

const COMMANDS = [
  { label: 'New project', icon: 'plus', run: (h) => h.create('projects') },
  { label: 'New task', icon: 'checks', run: (h) => h.create('tasks') },
  { label: 'New idea', icon: 'bulb', run: (h) => h.create('ideas') },
  { label: 'New presentation', icon: 'mic', run: (h) => h.create('presentations') },
  { label: 'Start / stop timer', icon: 'clock', run: () => (location.hash = '#/time') },
  { label: 'Go to Dashboard', icon: 'home', run: () => (location.hash = '#/') },
  { label: 'Go to Projects', icon: 'projects', run: () => (location.hash = '#/projects') },
  { label: 'Go to Presentations', icon: 'mic', run: () => (location.hash = '#/presentations') },
  { label: 'Go to Ideas', icon: 'bulb', run: () => (location.hash = '#/ideas') },
  { label: 'Go to Tasks', icon: 'checks', run: () => (location.hash = '#/tasks') },
  { label: 'Go to Time log', icon: 'clock', run: () => (location.hash = '#/time') },
  { label: 'Go to CV export', icon: 'cv', run: () => (location.hash = '#/cv') },
  { label: 'Go to Settings', icon: 'gear', run: () => (location.hash = '#/settings') },
];

function search(q) {
  const s = store.state;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (...f) => { const h = f.flat().join(' ').toLowerCase(); return words.every((w) => h.includes(w)); };
  const out = [];
  if (!words.length) return COMMANDS.slice(0, 5).map((c) => ({ ...c, kind: 'Action' }));
  for (const p of s.projects) if (hit(p.title, p.venue, p.tags || [], p.collaborators, p.waitingOn, p.notes)) out.push({ kind: 'Project', label: p.title, sub: stage(p.stage).label, icon: 'projects', ref: ['projects', p.id] });
  for (const p of s.presentations) if (hit(p.title, p.conference, p.location, p.notes)) out.push({ kind: 'Presentation', label: p.title, sub: `${p.conference} · ${presStatus(p.status).label}`, icon: 'mic', ref: ['presentations', p.id] });
  for (const i of s.ideas) if (hit(i.text, i.notes, i.tags || [])) out.push({ kind: 'Idea', label: i.text, icon: 'bulb', ref: ['ideas', i.id] });
  for (const t of s.tasks) if (hit(t.text)) out.push({ kind: 'Task', label: t.text, sub: (t.done ? 'Done · ' : '') + projectTitle(s, t.projectId), icon: 'checks', ref: ['tasks', t.id] });
  for (const c of COMMANDS) if (hit(c.label)) out.push({ ...c, kind: 'Action' });
  return out.slice(0, 30);
}

function draw() {
  const list = el.querySelector('.pal-list');
  list.innerHTML = items.length
    ? items.map((r, i) => `<button class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}">${icon(r.icon)}<span class="grow"><span class="clamp1">${esc(r.label || 'Untitled')}</span>${r.sub ? `<span class="muted small clamp1">${esc(r.sub)}</span>` : ''}</span><span class="pal-kind">${r.kind}</span></button>`).join('')
    : '<div class="pal-empty muted">No matches</div>';
  list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}

function run(i) {
  const r = items[i];
  if (!r) return;
  closePalette();
  if (r.ref) handlers.open(...r.ref);
  else r.run(handlers);
}

export function openPalette() {
  if (!store.state) return;
  el.classList.add('open');
  el.innerHTML = `<div class="modal-backdrop" data-close></div><div class="palette" role="dialog" aria-label="Search">
    <div class="pal-input">${icon('search')}<input id="pal-q" placeholder="Search projects, presentations, ideas, tasks… or type a command" autocomplete="off"><kbd>esc</kbd></div>
    <div class="pal-list"></div></div>`;
  const input = el.querySelector('#pal-q');
  sel = 0; items = search(''); draw();
  input.focus();
  input.addEventListener('input', () => { sel = 0; items = search(input.value); draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  });
}

export function closePalette() {
  el.classList.remove('open');
  el.innerHTML = '';
}
export const paletteOpen = () => el.classList.contains('open');

export function initPalette(h) {
  handlers = h;
  el = document.getElementById('palette');
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closePalette();
    const b = e.target.closest('[data-i]');
    if (b) run(+b.dataset.i);
  });
}
