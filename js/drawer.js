// Side panel editor for every kind of item. Edits save as you type.
import { store } from './store.js';
import { esc, nowISO, todayISO, splitTags, guessLinkLabel, fmtDate, fmtDuration, fmtRange, timeAgo, safeUrl } from './util.js';
import { STAGES, OUTCOMES, PRES_TYPES, PRES_STATUS, COLLECTION_LABEL, byId, stage, presStatus, newProject, newTask, entryMinutes, openTasks } from './model.js';
import { icon, badge, renderInto, toast } from './ui.js';

let current = null; // { col, id, isNew }
const root = () => document.getElementById('drawer');

// ---------- field helpers ----------
const fid = (f) => `d-${f}`;
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span class="field-label">${esc(label)}</span>${inner}</label>`;
const text = (label, f, v, ph = '', cls = '') =>
  field(label, `<input id="${fid(f)}" data-f="${f}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off">`, cls);
const area = (label, f, v, ph = '', rows = 4, cls = 'wide') =>
  field(label, `<textarea id="${fid(f)}" data-f="${f}" rows="${rows}" placeholder="${esc(ph)}">${esc(v)}</textarea>`, cls);
const date = (label, f, v, cls = '') => field(label, `<input type="date" id="${fid(f)}" data-f="${f}" value="${esc(v)}">`, cls);
const select = (label, f, v, opts, cls = '') =>
  field(label, `<select id="${fid(f)}" data-f="${f}">${opts.map((o) => `<option value="${esc(o.id)}" ${o.id === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`, cls);
const tags = (label, f, v, cls = 'wide') =>
  field(label, `<input id="${fid(f)}" data-f="${f}" data-kind="tags" value="${esc((v || []).join(', '))}" placeholder="Comma separated, e.g. AI / LLM, Cardiology" list="tag-options">`, cls);
const projectSelect = (label, f, v, s) =>
  select(label, f, v, [{ id: '', label: '— None —' }, ...s.projects.slice().sort((a, b) => a.title.localeCompare(b.title)).map((p) => ({ id: p.id, label: p.title || 'Untitled' }))], 'wide');

const titleBox = (f, v, ph) =>
  `<textarea id="${fid(f)}" class="title-input" data-f="${f}" rows="2" placeholder="${esc(ph)}">${esc(v)}</textarea>`;

function linksEditor(links = []) {
  return `<section class="d-section"><div class="d-section-head"><h4>Links</h4><button class="btn sm ghost" data-act="add-link">${icon('plus')}Add link</button></div>
    ${links.length ? '' : '<p class="muted small">Drive folders, Google Docs, DOIs, Overleaf, email threads…</p>'}
    <div class="rows">${links
      .map((l, i) => {
        const u = safeUrl(l.url);
        return `<div class="row-edit link-row">
          <input id="d-links-${i}-label" data-list="links" data-i="${i}" data-k="label" value="${esc(l.label)}" placeholder="Label">
          <input id="d-links-${i}-url" data-list="links" data-i="${i}" data-k="url" value="${esc(l.url)}" placeholder="Paste a URL">
          ${u ? `<a class="icon-btn" href="${esc(u)}" target="_blank" rel="noopener" title="Open">${icon('arrow')}</a>` : '<span class="icon-btn disabled">' + icon('arrow') + '</span>'}
          <button class="icon-btn" data-act="rm" data-list-name="links" data-i="${i}" title="Remove">${icon('x')}</button></div>`;
      })
      .join('')}</div></section>`;
}

// ---------- per-type bodies ----------
function projectBody(p, s) {
  const tasks = s.tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.done - b.done);
  const pres = s.presentations.filter((x) => x.projectId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const mins = s.timelog.filter((e) => e.projectId === p.id).reduce((n, e) => n + entryMinutes(e), 0);
  const timing = s.timer?.projectId === p.id;
  return `
    ${titleBox('title', p.title, 'Project or manuscript title')}
    <div class="grid2">
      ${select('Stage', 'stage', p.stage, STAGES)}
      ${date('Target date', 'dueDate', p.dueDate)}
      ${text('Journal / venue', 'venue', p.venue, 'Current or target journal', 'wide')}
      ${text('Waiting on', 'waitingOn', p.waitingOn, 'e.g. Steph to send transcripts', 'wide')}
      ${text('Collaborators / PI', 'collaborators', p.collaborators, 'Who you work with', 'wide')}
      ${text('Author list (for CV)', 'authors', p.authors, 'e.g. Tummala A, Smith J, …', 'wide')}
      ${tags('Tags', 'tags', p.tags)}
    </div>
    ${linksEditor(p.links)}
    <section class="d-section"><div class="d-section-head"><h4>Submission history</h4><button class="btn sm ghost" data-act="add-sub">${icon('plus')}Log submission</button></div>
      ${p.submissions?.length ? '' : '<p class="muted small">Track every journal you send this to and what happened.</p>'}
      <div class="rows">${(p.submissions || [])
        .map((x, i) => `<div class="row-edit sub-row">
          <input id="d-sub-${i}-venue" data-list="submissions" data-i="${i}" data-k="venue" value="${esc(x.venue)}" placeholder="Journal">
          <input type="date" id="d-sub-${i}-date" data-list="submissions" data-i="${i}" data-k="date" value="${esc(x.date)}" title="Date submitted">
          <select id="d-sub-${i}-outcome" data-list="submissions" data-i="${i}" data-k="outcome">${OUTCOMES.map((o) => `<option value="${o.id}" ${o.id === x.outcome ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
          <button class="icon-btn" data-act="rm" data-list-name="submissions" data-i="${i}" title="Remove">${icon('x')}</button></div>`)
        .join('')}</div></section>
    <section class="d-section"><div class="d-section-head"><h4>Tasks</h4></div>
      <div class="task-mini">${tasks
        .map((t) => `<div class="task-line ${t.done ? 'done' : ''}"><button class="checkbox ${t.done ? 'on' : ''}" data-act="toggle-task" data-id="${t.id}" aria-label="Toggle">${icon('check')}</button>
          <span>${esc(t.text)}</span>${t.dueDate ? `<span class="muted small">${fmtDate(t.dueDate, { year: false })}</span>` : ''}</div>`)
        .join('')}</div>
      <input id="d-newtask" class="quick" placeholder="Add a task and press Enter" data-enter="add-task"></section>
    <section class="d-section"><div class="d-section-head"><h4>Updates</h4></div>
      <div class="log-add"><input id="d-newlog" placeholder="What happened? e.g. Sent draft to PI" data-enter="add-log"><button class="btn sm" data-act="add-log">Add</button></div>
      <div class="log">${(p.log || [])
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map((l) => `<div class="log-item"><span class="log-date">${fmtDate(l.date, { year: true })}</span><span class="log-text">${esc(l.text)}</span><button class="icon-btn sm" data-act="rm-log" data-id="${l.id}" title="Remove">${icon('x')}</button></div>`)
        .join('')}</div></section>
    ${pres.length ? `<section class="d-section"><div class="d-section-head"><h4>Presentations</h4></div>${pres
      .map((x) => `<button class="mini-link" data-act="open" data-ref="presentations:${x.id}">${esc(x.conference || x.title)} <span class="muted small">${fmtRange(x.date, x.endDate, x.monthOnly)}</span></button>`)
      .join('')}</section>` : ''}
    <section class="d-section"><div class="d-section-head"><h4>Time</h4>
      <button class="btn sm ${timing ? 'danger' : 'ghost'}" data-act="timer">${icon(timing ? 'stop' : 'play')}${timing ? 'Stop timer' : 'Start timer'}</button></div>
      <p class="muted small">${mins ? `${fmtDuration(mins)} logged in total` : 'No time logged yet'}</p></section>
    ${area('Notes', 'notes', p.notes, 'Anything else: methods, reviewer comments, ideas…', 6)}`;
}

function presentationBody(p, s) {
  return `
    ${titleBox('title', p.title, 'Abstract / talk title')}
    <div class="grid2">
      ${text('Conference', 'conference', p.conference, 'e.g. AHA Scientific Sessions', 'wide')}
      ${text('Location', 'location', p.location, 'City, State or Virtual')}
      ${select('Status', 'status', p.status, PRES_STATUS)}
      ${date(p.monthOnly ? 'Date (month only)' : 'Start date', 'date', p.date)}
      ${date('End date', 'endDate', p.endDate)}
      ${date('Abstract deadline', 'deadline', p.deadline)}
      <div class="field"><span class="field-label">Type</span><div class="toggles">${PRES_TYPES.map(
        (t) => `<label class="toggle ${p.types?.includes(t.id) ? 'on' : ''}"><input type="checkbox" data-toggle="types" value="${t.id}" ${p.types?.includes(t.id) ? 'checked' : ''}>${t.label}</label>`
      ).join('')}</div></div>
      ${projectSelect('Related project', 'projectId', p.projectId, s)}
      ${text('Author list (for CV)', 'authors', p.authors, 'e.g. Tummala A, Smith J', 'wide')}
    </div>
    ${linksEditor(p.links)}
    ${area('Notes', 'notes', p.notes, 'Feedback, attendance, awards…', 5)}`;
}

function ideaBody(p) {
  return `
    ${titleBox('text', p.text, 'Describe the idea')}
    <div class="grid2">${tags('Tags', 'tags', p.tags)}</div>
    ${linksEditor(p.links)}
    ${area('Notes', 'notes', p.notes, 'Why it matters, possible mentors, datasets, first steps…', 6)}
    <div class="promote"><button class="btn primary" data-act="promote">${icon('rocket')}Turn into a project</button>
      <span class="muted small">Moves it to Projects → Planning.</span></div>`;
}

function taskBody(t, s) {
  return `
    ${titleBox('text', t.text, 'What needs doing?')}
    <div class="grid2">
      ${date('Due', 'dueDate', t.dueDate)}
      <div class="field"><span class="field-label">Status</span><button class="btn ${t.done ? '' : 'primary'}" data-act="toggle-self">${t.done ? 'Mark not done' : 'Mark done'}</button></div>
      ${projectSelect('Project', 'projectId', t.projectId, s)}
    </div>`;
}

function timeBody(e, s) {
  return `
    <div class="grid2">
      ${projectSelect('Project', 'projectId', e.projectId, s)}
      ${date('Date', 'date', e.date)}
      ${field('Start', `<input type="time" id="d-start" data-f="start" value="${esc(e.start)}">`)}
      ${field('End', `<input type="time" id="d-end" data-f="end" value="${esc(e.end)}">`)}
      ${text('Note', 'note', e.note, 'What you worked on', 'wide')}
    </div><p class="muted">${fmtDuration(entryMinutes(e))}</p>`;
}

const BODIES = { projects: projectBody, presentations: presentationBody, ideas: ideaBody, tasks: taskBody, timelog: timeBody };
const TITLE_FIELD = { projects: 'title', presentations: 'title', ideas: 'text', tasks: 'text', timelog: null };

// ---------- open / render / close ----------
export function openDrawer(col, id, { isNew = false } = {}) {
  current = { col, id, isNew };
  render();
  const el = root();
  el.classList.add('open');
  document.body.classList.add('drawer-open');
  const tf = TITLE_FIELD[col];
  if (isNew && tf) setTimeout(() => document.getElementById(fid(tf))?.focus(), 30);
}

export function render() {
  if (!current) return;
  const s = store.state;
  const item = byId(s[current.col], current.id);
  if (!item) return closeDrawer();
  const st = current.col === 'projects' ? badge(stage(item.stage).label, stage(item.stage).tone) : current.col === 'presentations' ? badge(presStatus(item.status).label, presStatus(item.status).tone) : '';
  renderInto(
    root(),
    `<div class="drawer-backdrop" data-act="close"></div>
    <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="Edit ${COLLECTION_LABEL[current.col]}">
      <header class="drawer-head"><span class="eyebrow">${COLLECTION_LABEL[current.col]}</span>${st}
        <span class="spacer"></span><button class="icon-btn" data-act="close" title="Close (Esc)">${icon('x')}</button></header>
      <div class="drawer-body">${BODIES[current.col](item, s)}</div>
      <footer class="drawer-foot"><span class="muted small">Edited ${timeAgo(item.updatedAt)} · saves automatically</span>
        <button class="btn sm ghost danger" data-act="delete">${icon('trash')}Delete</button></footer>
    </aside>
    <datalist id="tag-options">${[...new Set(s.projects.flatMap((p) => p.tags || []).concat(s.ideas.flatMap((i) => i.tags || [])))].map((t) => `<option value="${esc(t)}">`).join('')}</datalist>`
  );
  autosize();
}

function autosize() {
  for (const t of root().querySelectorAll('textarea')) {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 2 + 'px';
  }
}

export function closeDrawer() {
  if (!current) return;
  document.activeElement?.blur?.();
  const { col, id } = current;
  const item = byId(store.state[col], id);
  const tf = TITLE_FIELD[col];
  // Discard brand-new items that were never filled in.
  if (item && tf && !String(item[tf] || '').trim() && current.isNew) {
    store.update((s) => { s[col] = s[col].filter((x) => x.id !== id); });
  }
  current = null;
  root().classList.remove('open');
  document.body.classList.remove('drawer-open');
  setTimeout(() => { if (!current) root().innerHTML = ''; }, 200);
}

export const isOpen = () => !!current;
export const refreshIfOpen = () => current && render();

// ---------- mutations ----------
function mutate(fn, rerender = false) {
  const { col, id } = current;
  store.update((s) => {
    const it = byId(s[col], id);
    if (!it) return;
    fn(it, s);
    it.updatedAt = nowISO();
  });
  if (current) current.isNew = false;
  if (rerender) render();
}

const OUTCOME_STAGE = { pending: 'submitted', revise: 'revision', accepted: 'accepted' };

function onInput(e) {
  const t = e.target;
  if (!current) return;
  if (t.dataset.f) {
    const f = t.dataset.f;
    const val = t.dataset.kind === 'tags' ? splitTags(t.value) : t.value;
    const rerender = t.tagName === 'SELECT' || f === 'date';
    mutate((it) => {
      it[f] = val;
      if (f === 'date') it.monthOnly = false;
    }, rerender && e.type === 'change');
    if (t.tagName === 'TEXTAREA') autosize();
    return;
  }
  if (t.dataset.list) {
    const { list, i, k } = t.dataset;
    if (e.type === 'input' && t.tagName === 'SELECT') return; // handled on change
    mutate((it) => {
      const row = it[list][+i];
      if (!row) return;
      row[k] = t.value;
      if (list === 'submissions' && k === 'outcome' && current.col === 'projects') {
        const last = +i === it.submissions.length - 1;
        const next = OUTCOME_STAGE[t.value] || (last && t.value !== 'withdrawn' ? 'in_progress' : null);
        if (last && next && next !== it.stage && it.stage !== 'published') {
          it.stage = next;
          toast(`Moved to “${stage(next).label}”`);
        }
      }
    }, e.type === 'change' && (k === 'outcome' || (list === 'links' && k === 'url')));
    if (list === 'links' && k === 'url' && e.type === 'change') {
      mutate((it) => {
        const row = it.links[+i];
        if (row && !row.label.trim()) row.label = guessLinkLabel(row.url);
      }, true);
    }
    return;
  }
  if (t.dataset.toggle && e.type === 'change') {
    const f = t.dataset.toggle;
    mutate((it) => {
      const set = new Set(it[f] || []);
      t.checked ? set.add(t.value) : set.delete(t.value);
      it[f] = [...set];
    }, true);
  }
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !current) return;
  const act = b.dataset.act;
  const { col, id } = current;
  switch (act) {
    case 'close': return closeDrawer();
    case 'add-link': mutate((it) => it.links.push({ label: '', url: '' }), true); return focusLast('links', 'url');
    case 'add-sub':
      mutate((it) => {
        it.submissions.push({ id: Math.random().toString(36).slice(2, 10), venue: it.venue || '', date: todayISO(), outcome: 'pending' });
        if (['planning', 'in_progress', 'revision'].includes(it.stage)) { it.stage = 'submitted'; toast('Moved to “Under review”'); }
      }, true);
      return focusLast('sub', 'venue');
    case 'rm': return mutate((it) => it[b.dataset.listName].splice(+b.dataset.i, 1), true);
    case 'add-log': return addLog();
    case 'rm-log': return mutate((it) => { it.log = it.log.filter((l) => l.id !== b.dataset.id); }, true);
    case 'toggle-task':
      store.update((s) => { const t = byId(s.tasks, b.dataset.id); if (t) { t.done = !t.done; t.doneAt = t.done ? nowISO() : ''; } });
      return render();
    case 'toggle-self': return mutate((it) => { it.done = !it.done; it.doneAt = it.done ? nowISO() : ''; }, true);
    case 'open': { const [c, i] = b.dataset.ref.split(':'); return openDrawer(c, i); }
    case 'timer': return window.dispatchEvent(new CustomEvent('rt:timer', { detail: { projectId: id } }));
    case 'promote': return promote();
    case 'delete': return remove(col, id);
  }
}

function focusLast(prefix, k) {
  const els = root().querySelectorAll(`[id^="d-${prefix}-"][id$="-${k}"]`);
  els[els.length - 1]?.focus();
}

function addLog() {
  const inp = document.getElementById('d-newlog');
  const v = inp?.value.trim();
  if (!v) return;
  mutate((it) => { (it.log ||= []).push({ id: Math.random().toString(36).slice(2, 10), date: todayISO(), text: v }); }, true);
  document.getElementById('d-newlog')?.focus();
}

function addTask() {
  const inp = document.getElementById('d-newtask');
  const v = inp?.value.trim();
  if (!v) return;
  const pid = current.id;
  store.update((s) => s.tasks.push(newTask({ text: v, projectId: pid })));
  render();
  document.getElementById('d-newtask')?.focus();
}

function promote() {
  const { id } = current;
  const idea = byId(store.state.ideas, id);
  if (!idea) return;
  const p = newProject({ title: idea.text, notes: idea.notes, links: idea.links || [], tags: idea.tags || [], log: [{ id: Math.random().toString(36).slice(2, 10), date: todayISO(), text: 'Started from an idea' }] });
  store.update((s) => { s.ideas = s.ideas.filter((x) => x.id !== id); s.projects.push(p); });
  toast('Idea moved to Projects');
  openDrawer('projects', p.id);
}

export function remove(col, id) {
  const list = store.state[col];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const item = list[idx];
  if (current?.id === id) { current = null; root().classList.remove('open'); document.body.classList.remove('drawer-open'); root().innerHTML = ''; }
  store.update((s) => s[col].splice(idx, 1));
  toast(`${COLLECTION_LABEL[col]} deleted`, { label: 'Undo', fn: () => store.update((s) => s[col].splice(Math.min(idx, s[col].length), 0, item)) });
}

// ---------- wire up once ----------
export function initDrawer() {
  const el = root();
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.enter) {
      e.preventDefault();
      e.target.dataset.enter === 'add-log' ? addLog() : addTask();
    }
  });
  store.subscribe((kind, info) => { if (kind === 'data' && info.remote) refreshIfOpen(); });
}
