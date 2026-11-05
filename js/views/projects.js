import { esc, timeAgo, relDays, daysFromToday, nowISO, todayISO } from '../util.js';
import { STAGES, stage, allTags, currentSubmission, byId, openTasks } from '../model.js';
import { store } from '../store.js';
import { icon, badge, tagChips, empty, toast } from '../ui.js';

function matches(p, q, tag) {
  if (tag && !(p.tags || []).includes(tag)) return false;
  if (!q) return true;
  const hay = [p.title, p.venue, p.collaborators, p.waitingOn, p.notes, ...(p.tags || []), ...(p.submissions || []).map((x) => x.venue)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function card(p, s) {
  const sub = currentSubmission(p);
  const tasks = openTasks(s, p.id);
  const rejections = (p.submissions || []).filter((x) => x.outcome.includes('rejected')).length;
  const due = p.dueDate && p.stage !== 'published' ? `<span class="due ${daysFromToday(p.dueDate) < 0 ? 'overdue' : ''}">${icon('calendar')}${relDays(p.dueDate)}</span>` : '';
  return `<article class="pcard" draggable="true" data-drag="${p.id}" data-act="open" data-ref="projects:${p.id}" tabindex="0">
    <div class="pcard-title">${esc(p.title || 'Untitled')}</div>
    ${p.venue || sub ? `<div class="pcard-venue muted small">${esc(sub?.venue || p.venue)}</div>` : ''}
    ${p.waitingOn ? `<div class="waiting">${icon('hourglass')}<span class="clamp2">${esc(p.waitingOn)}</span></div>` : ''}
    <div class="pcard-foot">
      ${tagChips((p.tags || []).slice(0, 3))}
      <span class="spacer"></span>
      ${due}
      ${tasks.length ? `<span class="meta" title="Open tasks">${icon('checks')}${tasks.length}</span>` : ''}
      ${rejections ? `<span class="meta" title="Prior submissions">↺${rejections}</span>` : ''}
      ${(p.links || []).length ? `<span class="meta" title="Links">${icon('link')}${p.links.length}</span>` : ''}
    </div></article>`;
}

function board(list, s) {
  const cols = STAGES.filter((st) => st.id !== 'paused' || list.some((p) => p.stage === 'paused'));
  return `<div class="board">${cols
    .map((st) => {
      const items = list.filter((p) => p.stage === st.id).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return `<section class="column" data-drop="${st.id}">
        <header class="col-head"><i class="dot tone-${st.tone}"></i>${st.label}<span class="count">${items.length}</span>
          <button class="icon-btn sm" data-act="new" data-col="projects" data-preset='{"stage":"${st.id}"}' title="Add to ${st.label}">${icon('plus')}</button></header>
        <div class="col-body">${items.map((p) => card(p, s)).join('') || '<div class="col-empty">Drop here</div>'}</div></section>`;
    })
    .join('')}</div>`;
}

function table(list) {
  const order = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
  list = list.slice().sort((a, b) => order[a.stage] - order[b.stage] || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Title</th><th>Stage</th><th class="hide-sm">Journal / venue</th><th class="hide-sm">Tags</th><th class="hide-sm">Updated</th></tr></thead>
    <tbody>${list
      .map((p) => {
        const sub = currentSubmission(p);
        return `<tr data-act="open" data-ref="projects:${p.id}" tabindex="0">
        <td><div class="clamp2">${esc(p.title || 'Untitled')}</div>${p.waitingOn ? `<div class="waiting small">${icon('hourglass')}${esc(p.waitingOn)}</div>` : ''}</td>
        <td>${badge(stage(p.stage).label, stage(p.stage).tone)}</td>
        <td class="hide-sm muted">${esc(sub?.venue || p.venue)}</td>
        <td class="hide-sm">${tagChips(p.tags)}</td>
        <td class="hide-sm muted nowrap">${timeAgo(p.updatedAt)}</td></tr>`;
      })
      .join('')}</tbody></table></div>`;
}

export function render(s, ui, params) {
  const stageFilter = params.get('stage') || '';
  const view = stageFilter ? 'list' : ui.projView || 'board';
  const q = ui.projSearch || '';
  const tag = ui.projTag || '';
  let list = s.projects.filter((p) => matches(p, q, tag));
  if (stageFilter) {
    const group = stageFilter === 'submitted' ? ['submitted', 'revision', 'accepted'] : stageFilter === 'in_progress' ? ['planning', 'in_progress'] : [stageFilter];
    list = list.filter((p) => group.includes(p.stage));
  }
  const tags = allTags(s);
  return `
  <header class="page-head">
    <div><h1>Projects</h1><p class="muted">Manuscripts, reviews and everything in between · ${s.projects.length} total</p></div>
    <div class="head-actions"><button class="btn primary" data-act="new" data-col="projects">${icon('plus')}New project</button></div>
  </header>
  <div class="toolbar">
    <div class="search">${icon('search')}<input id="proj-search" data-ui="projSearch" value="${esc(q)}" placeholder="Filter projects…" autocomplete="off"></div>
    <div class="seg">
      <button class="${view === 'board' ? 'on' : ''}" data-act="proj-view" data-v="board">${icon('board')}Board</button>
      <button class="${view === 'list' ? 'on' : ''}" data-act="proj-view" data-v="list">${icon('list')}List</button>
    </div>
    ${stageFilter ? `<a class="chip on" href="#/projects">${esc(stageFilter === 'submitted' ? 'Submitted / pending' : stageFilter === 'in_progress' ? 'In progress' : stage(stageFilter).label)} ${icon('x')}</a>` : ''}
  </div>
  ${tags.length ? `<div class="chips-row">${tags.map((t) => `<button class="chip ${t === tag ? 'on' : ''}" data-act="ui" data-k="projTag" data-v="${t === tag ? '' : esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
  ${!s.projects.length ? empty('No projects yet', 'Add your first manuscript or project.', `<button class="btn primary" data-act="new" data-col="projects">${icon('plus')}New project</button>`)
    : !list.length ? empty('No matches', 'Try a different filter.')
    : view === 'board' ? board(list, s) : table(list)}`;
}

export const actions = {
  'proj-view': (el, ctx) => {
    ctx.setUI({ projView: el.dataset.v });
    if (location.hash.includes('?')) location.hash = '#/projects';
  },
};

// Drag & drop between board columns.
export function initDnD(main) {
  let dragId = null;
  main.addEventListener('dragstart', (e) => {
    const c = e.target.closest?.('[data-drag]');
    if (!c) return;
    dragId = c.dataset.drag;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => c.classList.add('dragging'));
  });
  main.addEventListener('dragend', () => {
    dragId = null;
    main.querySelectorAll('.dragging, .drop-over').forEach((n) => n.classList.remove('dragging', 'drop-over'));
  });
  main.addEventListener('dragover', (e) => {
    const col = e.target.closest?.('[data-drop]');
    if (!col || !dragId) return;
    e.preventDefault();
    main.querySelectorAll('.drop-over').forEach((n) => n !== col && n.classList.remove('drop-over'));
    col.classList.add('drop-over');
  });
  main.addEventListener('drop', (e) => {
    const col = e.target.closest?.('[data-drop]');
    if (!col || !dragId) return;
    e.preventDefault();
    const id = dragId, to = col.dataset.drop;
    const p = byId(store.state.projects, id);
    if (!p || p.stage === to) return;
    const from = p.stage;
    store.update((s) => {
      const x = byId(s.projects, id);
      x.stage = to;
      x.updatedAt = nowISO();
      (x.log ||= []).push({ id: Math.random().toString(36).slice(2, 10), date: todayISO(), text: `Moved from ${stage(from).label} to ${stage(to).label}` });
    });
    toast(`Moved to “${stage(to).label}”`, { label: 'Undo', fn: () => store.update((s) => { const x = byId(s.projects, id); x.stage = from; x.log.pop(); }) });
  });
}
