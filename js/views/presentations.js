import { esc, fmtRange, relDays, daysFromToday, parseISO } from '../util.js';
import { PRES_TYPES, presType, presStatus, projectTitle } from '../model.js';
import { icon, badge, linkList, empty } from '../ui.js';

function row(p, s) {
  const proj = p.projectId ? projectTitle(s, p.projectId) : '';
  return `<article class="prow" data-act="open" data-ref="presentations:${p.id}" tabindex="0">
    <div class="prow-date">${p.date ? `<b>${fmtRange(p.date, '', true).split(' ')[0]}</b><span>${parseISO(p.date).getFullYear()}</span>` : '<span class="muted">TBD</span>'}</div>
    <div class="prow-main">
      <div class="prow-title">${esc(p.title || 'Untitled')}</div>
      <div class="muted small">${esc(p.conference)}${p.location ? ` · ${esc(p.location)}` : ''}${p.date && !p.monthOnly ? ` · ${fmtRange(p.date, p.endDate)}` : ''}</div>
      ${proj ? `<div class="small proj-ref">${icon('projects')}${esc(proj)}</div>` : ''}
      ${p.notes ? `<div class="small muted clamp1">${esc(p.notes)}</div>` : ''}
    </div>
    <div class="prow-side">
      <div class="badges">${(p.types || []).map((t) => badge(presType(t).label, presType(t).tone)).join('')}</div>
      ${p.status !== 'presented' ? badge(presStatus(p.status).label, presStatus(p.status).tone, 'outline') : ''}
      ${p.deadline && p.status === 'planned' ? `<span class="due ${daysFromToday(p.deadline) < 0 ? 'overdue' : 'soon'}">Abstract due ${relDays(p.deadline)}</span>` : ''}
      ${linkList(p.links, { compact: true })}
    </div></article>`;
}

export function render(s, ui, params) {
  const type = params.get('type') || ui.presType || '';
  const list = s.presentations.filter((p) => !type || p.types?.includes(type) || (type === 'oral' && p.types?.includes('workshop')));
  const future = list.filter((p) => !p.date || daysFromToday(p.date) >= 0 || ['planned', 'submitted', 'accepted'].includes(p.status))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const past = list.filter((p) => !future.includes(p)).sort((a, b) => b.date.localeCompare(a.date));
  const byYear = {};
  for (const p of past) (byYear[p.date.slice(0, 4)] ||= []).push(p);
  const count = (t) => s.presentations.filter((p) => p.types?.includes(t)).length;

  return `
  <header class="page-head">
    <div><h1>Presentations</h1><p class="muted">Abstracts, posters, talks and workshops · ${s.presentations.length} total</p></div>
    <div class="head-actions"><button class="btn primary" data-act="new" data-col="presentations">${icon('plus')}New presentation</button></div>
  </header>
  <div class="chips-row">
    <button class="chip ${!type ? 'on' : ''}" data-act="pres-type" data-v="">All <b>${s.presentations.length}</b></button>
    ${PRES_TYPES.map((t) => `<button class="chip ${type === t.id ? 'on' : ''}" data-act="pres-type" data-v="${t.id}">${t.label} <b>${count(t.id)}</b></button>`).join('')}
  </div>
  ${!list.length ? empty('Nothing here yet', 'Track conferences you’re submitting to, and everything you’ve presented.', `<button class="btn primary" data-act="new" data-col="presentations">${icon('plus')}New presentation</button>`) : ''}
  ${future.length ? `<section class="card"><div class="card-head"><h2>Upcoming & in the works</h2><span class="count">${future.length}</span></div><div class="plist">${future.map((p) => row(p, s)).join('')}</div></section>` : ''}
  ${Object.keys(byYear).sort().reverse().map((y) => `<section class="card"><div class="card-head"><h2>${y}</h2><span class="count">${byYear[y].length}</span></div><div class="plist">${byYear[y].map((p) => row(p, s)).join('')}</div></section>`).join('')}`;
}

export const actions = {
  'pres-type': (el, ctx) => {
    ctx.setUI({ presType: el.dataset.v });
    if (location.hash.includes('?')) location.hash = '#/presentations';
  },
};
