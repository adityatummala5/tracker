import { esc, fmtDate, fmtDuration, fmtClock, todayISO, parseISO } from '../util.js';
import { projectTitle, entryMinutes, minutesSince, weekStartISO, ACTIVE_STAGES } from '../model.js';
import { icon, empty } from '../ui.js';

const projOptions = (s, sel) => {
  const list = s.projects.filter((p) => ACTIVE_STAGES.includes(p.stage) || p.id === sel).sort((a, b) => a.title.localeCompare(b.title));
  return `<option value="">— No project —</option>${list.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}`;
};

export function render(s, ui) {
  const t = s.timer;
  const month = todayISO().slice(0, 7) + '-01';
  const totals = {};
  for (const e of s.timelog) totals[e.projectId || ''] = (totals[e.projectId || ''] || 0) + entryMinutes(e);
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = ranked[0]?.[1] || 1;
  const entries = s.timelog.slice().sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const byDate = {};
  for (const e of entries) (byDate[e.date] ||= []).push(e);

  return `
  <header class="page-head"><div><h1>Time log</h1><p class="muted">Clock in and out for paid or tracked projects</p></div>
    <div class="head-actions"><button class="btn" data-act="export-time">${icon('download')}Export CSV</button></div></header>

  <div class="time-top">
    <section class="card timer-card ${t ? 'running' : ''}">
      ${t ? `<div class="timer-live"><span class="timer-clock" data-timer-clock>${fmtClock((Date.now() - new Date(t.startedAt)) / 1000)}</span>
          <div><div class="muted small">Started ${new Date(t.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div><b>${esc(projectTitle(s, t.projectId) || 'No project')}</b></div></div>
          <button class="btn danger lg" data-act="timer-stop">${icon('stop')}Clock out</button>`
      : `<h2>Start a timer</h2>
        <div class="timer-form"><select id="timer-proj">${projOptions(s, ui.lastTimerProject || '')}</select>
        <button class="btn primary lg" data-act="timer-start">${icon('play')}Clock in</button></div>`}
    </section>
    <section class="card totals">
      <div class="tot"><span class="muted small">This week</span><b>${fmtDuration(minutesSince(s, weekStartISO()))}</b></div>
      <div class="tot"><span class="muted small">This month</span><b>${fmtDuration(minutesSince(s, month))}</b></div>
      <div class="tot"><span class="muted small">All time</span><b>${fmtDuration(minutesSince(s, '0000'))}</b></div>
    </section>
  </div>

  <section class="card"><div class="card-head"><h2>Add an entry manually</h2></div>
    <div class="manual">
      <input type="date" id="m-date" value="${todayISO()}">
      <input type="time" id="m-start" title="Clock in">
      <input type="time" id="m-end" title="Clock out">
      <select id="m-proj">${projOptions(s, ui.lastTimerProject || '')}</select>
      <input id="m-note" placeholder="Note (optional)">
      <button class="btn primary" data-act="manual-time">Add</button>
    </div></section>

  ${ranked.length ? `<section class="card"><div class="card-head"><h2>By project</h2></div><div class="bars">${ranked
    .map(([pid, m]) => `<div class="bar-row"><span class="clamp1">${esc(projectTitle(s, pid) || 'No project')}</span><div class="bar"><i style="width:${(m / max) * 100}%"></i></div><b>${fmtDuration(m)}</b></div>`)
    .join('')}</div></section>` : ''}

  <section class="card"><div class="card-head"><h2>Entries</h2><span class="count">${s.timelog.length}</span></div>
  ${entries.length ? Object.keys(byDate).map((d) => `<h3 class="group-h">${fmtDate(d, { long: false })} <span class="muted small">${parseISO(d).toLocaleDateString([], { weekday: 'long' })} · ${fmtDuration(byDate[d].reduce((n, e) => n + entryMinutes(e), 0))}</span></h3>
    ${byDate[d].map((e) => `<button class="time-row" data-act="open" data-ref="timelog:${e.id}"><span class="nowrap">${e.start || '?'} – ${e.end || '?'}</span><span class="grow clamp1">${esc(projectTitle(s, e.projectId) || 'No project')}${e.note ? ` <span class="muted">· ${esc(e.note)}</span>` : ''}</span><b>${fmtDuration(entryMinutes(e))}</b></button>`).join('')}`).join('')
    : empty('No time logged yet')}</section>`;
}
