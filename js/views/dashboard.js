import { esc, fmtDate, relDays, greeting, fmtDuration, plural, timeAgo, todayISO } from '../util.js';
import { STAGES, stats, attention, upcoming, openTasks, stage, projectTitle, minutesSince, weekStartISO, ACTIVE_STAGES, currentSubmission } from '../model.js';
import { icon, badge, empty } from '../ui.js';
import { taskRow } from './tasks.js';

const statCard = (n, label, href, tone) =>
  `<a class="stat tone-${tone}" href="${href}"><span class="stat-n">${n}</span><span class="stat-l">${esc(label)}</span></a>`;

function attentionRow(a) {
  const map = {
    overdue: ['alert', 'red', `Overdue · ${relDays(a.due)}`],
    waiting: ['hourglass', 'amber', `Waiting on ${a.who}`],
    stale: ['clock', 'slate', `No updates in ${a.days} days`],
    review: ['hourglass', 'amber', `Under review at ${a.venue || 'journal'} for ${a.days} days`],
    deadline: ['calendar', 'violet', `Due ${relDays(a.due)}`],
  };
  const [ic, tone, sub] = map[a.kind];
  return `<button class="att-row" data-act="open" data-ref="${a.ref.join(':')}">
    <span class="att-icon tone-${tone}">${icon(ic)}</span>
    <span class="att-text"><span class="clamp1">${esc(a.text)}</span><span class="muted small">${esc(sub)}</span></span></button>`;
}

function pipeline(s) {
  const counts = STAGES.map((st) => ({ ...st, n: s.projects.filter((p) => p.stage === st.id).length })).filter((x) => x.n);
  return `<div class="pipeline" role="img" aria-label="Projects by stage">${counts
    .map((c) => `<a href="#/projects" class="pipe-seg tone-${c.tone}" style="flex:${c.n}" title="${c.label}: ${c.n}"></a>`)
    .join('')}</div><div class="pipe-legend">${counts
    .map((c) => `<span><i class="dot tone-${c.tone}"></i>${c.label} <b>${c.n}</b></span>`)
    .join('')}</div>`;
}

export function render(s) {
  const st = stats(s);
  const att = attention(s);
  const up = upcoming(s).slice(0, 8);
  const tasks = openTasks(s).slice(0, 8);
  const active = s.projects
    .filter((p) => ['in_progress', 'submitted', 'revision', 'accepted'].includes(p.stage))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 8);
  const week = minutesSince(s, weekStartISO());

  return `
  <header class="page-head">
    <div><h1>${greeting()}</h1><p class="muted">${fmtDate(todayISO(), { long: true })} · ${plural(s.projects.filter((p) => ACTIVE_STAGES.includes(p.stage)).length, 'active project')}</p></div>
    <div class="head-actions">
      <button class="btn" data-act="new" data-col="ideas">${icon('bulb')}Idea</button>
      <button class="btn" data-act="new" data-col="presentations">${icon('mic')}Presentation</button>
      <button class="btn primary" data-act="new" data-col="projects">${icon('plus')}Project</button>
    </div>
  </header>

  <section class="stats">
    ${statCard(st.published, 'Publications', '#/projects?stage=published', 'green')}
    ${statCard(st.pending, 'Submitted / pending', '#/projects?stage=submitted', 'amber')}
    ${statCard(st.inProgress, 'In progress', '#/projects?stage=in_progress', 'blue')}
    ${statCard(st.abstracts, 'Abstracts', '#/presentations?type=abstract', 'violet')}
    ${statCard(st.posters, 'Posters', '#/presentations?type=poster', 'sky')}
    ${statCard(st.orals, 'Oral presentations', '#/presentations?type=oral', 'teal')}
  </section>

  <section class="card"><div class="card-head"><h2>Pipeline</h2><a href="#/projects" class="btn-link">Open board ${icon('arrow')}</a></div>${pipeline(s)}</section>

  <div class="dash-grid">
    <div class="col">
      <section class="card"><div class="card-head"><h2>Needs attention</h2><span class="count">${att.length}</span></div>
        ${att.length ? `<div class="att-list">${att.map(attentionRow).join('')}</div>` : empty('All clear', 'Nothing overdue, stale, or blocked.')}</section>
      <section class="card"><div class="card-head"><h2>Active work</h2><a href="#/projects" class="btn-link">All projects ${icon('arrow')}</a></div>
        ${active.length ? `<div class="mini-list">${active
          .map((p) => {
            const sub = currentSubmission(p);
            return `<button class="mini-row" data-act="open" data-ref="projects:${p.id}">
              <span class="clamp1 grow">${esc(p.title || 'Untitled')}</span>
              ${sub && p.stage !== 'in_progress' ? `<span class="muted small nowrap hide-sm">${esc(sub.venue)}</span>` : ''}
              ${badge(stage(p.stage).label, stage(p.stage).tone)}<span class="muted small nowrap hide-sm">${timeAgo(p.updatedAt)}</span></button>`;
          })
          .join('')}</div>` : empty('No active projects')}</section>
    </div>
    <div class="col">
      <section class="card"><div class="card-head"><h2>Tasks</h2><a href="#/tasks" class="btn-link">All tasks ${icon('arrow')}</a></div>
        <input id="dash-task" class="quick" placeholder="Add a task… (press Enter)" data-enter="quick-task">
        <div class="task-list">${tasks.map((t) => taskRow(t, s, { compact: true })).join('') || '<p class="muted small pad">No open tasks.</p>'}</div></section>
      <section class="card"><div class="card-head"><h2>Coming up</h2><span class="muted small">next 60 days</span></div>
        ${up.length ? `<div class="mini-list">${up
          .map((u) => `<button class="mini-row" data-act="open" data-ref="${u.ref.join(':')}">
            <span class="date-pill"><b>${fmtDate(u.date, { year: false })}</b></span>
            <span class="grow clamp1">${esc(u.text)}</span><span class="muted small nowrap">${esc(u.kind)} · ${relDays(u.date)}</span></button>`)
          .join('')}</div>` : empty('Nothing scheduled', 'Add due dates to tasks, or conference dates and abstract deadlines to presentations.')}</section>
      <section class="card"><div class="card-head"><h2>Time this week</h2><a href="#/time" class="btn-link">Time log ${icon('arrow')}</a></div>
        <div class="week-time"><span class="big">${fmtDuration(week)}</span>
        ${s.timer ? `<span class="badge tone-red pulse">● Timer running · ${esc(projectTitle(s, s.timer.projectId) || 'No project')}</span>` : '<a class="btn sm" href="#/time">' + icon('play') + 'Start a timer</a>'}</div></section>
    </div>
  </div>`;
}
