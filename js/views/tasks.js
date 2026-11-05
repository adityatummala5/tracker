import { esc, fmtDate, relDays, daysFromToday, nowISO } from '../util.js';
import { byId, projectTitle, taskSort, newTask } from '../model.js';
import { store } from '../store.js';
import { icon, empty } from '../ui.js';

export function taskRow(t, s, { compact = false } = {}) {
  const overdue = !t.done && t.dueDate && daysFromToday(t.dueDate) < 0;
  const proj = t.projectId ? projectTitle(s, t.projectId) : '';
  return `<div class="task ${t.done ? 'done' : ''}">
    <button class="checkbox ${t.done ? 'on' : ''}" data-act="toggle-task" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}">${icon('check')}</button>
    <button class="task-main" data-act="open" data-ref="tasks:${t.id}">
      <span class="task-text">${esc(t.text || 'Untitled task')}</span>
      ${proj ? `<span class="task-proj clamp1">${esc(proj)}</span>` : ''}
    </button>
    ${t.dueDate ? `<span class="due ${overdue ? 'overdue' : daysFromToday(t.dueDate) <= 2 && !t.done ? 'soon' : ''}" title="${fmtDate(t.dueDate)}">${compact ? relDays(t.dueDate) : fmtDate(t.dueDate, { year: false })}</span>` : ''}
  </div>`;
}

export function render(s, ui) {
  const filter = ui.taskFilter || 'open';
  const pid = ui.taskProject || '';
  let list = s.tasks.filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : true) && (!pid || t.projectId === pid));
  list = filter === 'done' ? list.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')) : list.sort((a, b) => a.done - b.done || taskSort(a, b));

  const groups = filter === 'done' ? [['Completed', list]] : [
    ['Overdue', list.filter((t) => !t.done && t.dueDate && daysFromToday(t.dueDate) < 0)],
    ['This week', list.filter((t) => !t.done && t.dueDate && daysFromToday(t.dueDate) >= 0 && daysFromToday(t.dueDate) <= 7)],
    ['Later', list.filter((t) => !t.done && t.dueDate && daysFromToday(t.dueDate) > 7)],
    ['No due date', list.filter((t) => !t.done && !t.dueDate)],
    ['Done', list.filter((t) => t.done)],
  ];
  const projOpts = s.projects.filter((p) => s.tasks.some((t) => t.projectId === p.id)).sort((a, b) => a.title.localeCompare(b.title));

  return `
  <header class="page-head"><div><h1>Tasks</h1><p class="muted">${s.tasks.filter((t) => !t.done).length} open</p></div></header>
  <div class="toolbar">
    <div class="seg">${['open', 'all', 'done'].map((f) => `<button class="${filter === f ? 'on' : ''}" data-act="ui" data-k="taskFilter" data-v="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
    <select id="task-proj" data-ui="taskProject"><option value="">All projects</option>${projOpts.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select>
  </div>
  <section class="card">
    <div class="task-add">
      <input id="task-new" class="quick" placeholder="Add a task… (press Enter)" data-enter="quick-task">
      <input id="task-new-due" type="date" title="Due date (optional)">
    </div>
    ${list.length ? groups.filter(([, g]) => g.length).map(([name, g]) => `<h3 class="group-h">${name} <span class="count">${g.length}</span></h3><div class="task-list">${g.map((t) => taskRow(t, s)).join('')}</div>`).join('') : empty(filter === 'done' ? 'Nothing completed yet' : 'No open tasks', 'Type above to add one.')}
  </section>`;
}

export const actions = {
  'toggle-task': (el) =>
    store.update((s) => {
      const t = byId(s.tasks, el.dataset.id);
      if (t) { t.done = !t.done; t.doneAt = t.done ? nowISO() : ''; t.updatedAt = nowISO(); }
    }),
};

export function quickAdd(input, ui) {
  const text = input.value.trim();
  if (!text) return;
  const due = document.getElementById('task-new-due')?.value || '';
  store.update((s) => s.tasks.push(newTask({ text, dueDate: due, projectId: ui.taskProject || '' })));
  input.value = '';
  const d = document.getElementById('task-new-due');
  if (d) d.value = '';
}
