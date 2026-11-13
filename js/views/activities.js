// Activities, leadership, service, honors… laid out exactly like a CV.
// Every entry is clickable to edit; each section (or the whole page) copies as Word/Docs-ready formatting.
import { esc, safeUrl } from '../util.js';
import { CATEGORIES, category, activityDates, activitySort } from '../model.js';
import { icon, toast, empty } from '../ui.js';

const visible = (a, ui) => ui.actShowHidden || a.onCv !== false;

function matches(a, q) {
  if (!q) return true;
  const hay = [a.title, a.organization, a.location, a.dateText, ...(a.bullets || []), ...(a.tags || []), a.notes].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function grouped(s, ui = {}) {
  const q = ui.actSearch || '';
  return CATEGORIES.map((c) => ({
    ...c,
    items: s.activities.filter((a) => category(a.category).id === c.id && visible(a, ui) && matches(a, q)).sort(activitySort),
  }));
}

// ---------- on-screen CV ----------
function entryHTML(a) {
  const c = category(a.category);
  const off = a.onCv === false ? ' off' : '';
  const open = `data-act="open" data-ref="activities:${a.id}" tabindex="0"`;
  const link = (a.links || []).map((l) => safeUrl(l.url)).find(Boolean);
  if (c.style === 'skills')
    return `<div class="cv-skill${off}" ${open}><b>${esc(a.title || 'Skills')}:</b> ${esc((a.bullets || []).join(', '))}</div>`;
  if (c.style === 'line')
    return `<div class="cv-row cv-honor${off}" ${open}><span><b>${esc(a.title || 'Untitled award')}</b>${a.organization ? `, ${esc(a.organization)}` : ''}${(a.bullets || []).length ? ` <span class="cv-sub">– ${esc(a.bullets.join('; '))}</span>` : ''}</span><span class="cv-date">${esc(activityDates(a))}</span></div>`;
  return `<div class="cv-entry${off}" ${open}>
    <div class="cv-row"><span><b>${esc(a.organization || 'Organization')}</b>${a.location ? ` | ${esc(a.location)}` : ''}</span><span class="cv-date">${esc(activityDates(a))}</span></div>
    ${a.title ? `<div class="cv-role">${esc(a.title)}${a.hours ? ` <span class="cv-sub">(${esc(a.hours)} hrs)</span>` : ''}</div>` : ''}
    ${(a.bullets || []).length ? `<ul>${a.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${a.onCv === false ? '<span class="cv-flag">Hidden from CV</span>' : ''}
    ${link ? `<a class="cv-link" href="${esc(link)}" target="_blank" rel="noopener" data-stop>${icon('link')}</a>` : ''}
  </div>`;
}

// ---------- export (Word / Google Docs friendly) ----------
const FONT = "font-family:'Times New Roman',Times,serif;font-size:11pt;color:#000;";
function exportHTML(sections) {
  const row = (left, right) =>
    `<table style="width:100%;border-collapse:collapse;${FONT}"><tr><td style="padding:0;${FONT}">${left}</td><td style="padding:0;text-align:right;white-space:nowrap;${FONT}">${esc(right)}</td></tr></table>`;
  return sections.map((sec) => {
    const head = `<p style="${FONT}font-weight:bold;text-transform:uppercase;border-bottom:1px solid #000;margin:10pt 0 4pt;">${esc(sec.label)}</p>`;
    const body = sec.items.map((a) => {
      if (sec.style === 'skills') return `<p style="${FONT}margin:0 0 2pt;"><b>${esc(a.title)}:</b> ${esc((a.bullets || []).join(', '))}</p>`;
      if (sec.style === 'line') return row(`<b>${esc(a.title)}</b>${a.organization ? `, ${esc(a.organization)}` : ''}${(a.bullets || []).length ? ` – ${esc(a.bullets.join('; '))}` : ''}`, activityDates(a));
      return `<div style="margin:0 0 6pt;">${row(`<b>${esc(a.organization)}</b>${a.location ? ` | ${esc(a.location)}` : ''}`, activityDates(a))}
        ${a.title ? `<p style="${FONT}font-style:italic;margin:0;">${esc(a.title)}</p>` : ''}
        ${(a.bullets || []).length ? `<ul style="margin:0;padding-left:18pt;">${a.bullets.map((b) => `<li style="${FONT}">${esc(b)}</li>`).join('')}</ul>` : ''}</div>`;
    }).join('');
    return head + body;
  }).join('');
}
function exportText(sections) {
  return sections.map((sec) => {
    const lines = [sec.label.toUpperCase()];
    for (const a of sec.items) {
      if (sec.style === 'skills') { lines.push(`${a.title}: ${(a.bullets || []).join(', ')}`); continue; }
      if (sec.style === 'line') { lines.push(`${a.title}${a.organization ? `, ${a.organization}` : ''}${activityDates(a) ? `\t${activityDates(a)}` : ''}`); continue; }
      lines.push(`${a.organization}${a.location ? ` | ${a.location}` : ''}\t${activityDates(a)}`);
      if (a.title) lines.push(a.title);
      for (const b of a.bullets || []) lines.push(`• ${b}`);
      lines.push('');
    }
    return lines.join('\n').trim();
  }).join('\n\n');
}

async function copySections(sections) {
  const html = exportHTML(sections), text = exportText(sections);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
  toast('Copied in CV format, ready to paste into Word or Google Docs');
}

// ---------- page ----------
export function render(s, ui) {
  const secs = grouped(s, ui);
  const total = s.activities.length;
  const hidden = s.activities.filter((a) => a.onCv === false).length;
  const shown = secs.filter((x) => x.items.length);
  const empties = secs.filter((x) => !x.items.length);
  return `
  <header class="page-head">
    <div><h1>Activities</h1><p class="muted">Leadership, service, honors and everything else, already in CV format · ${total} entries</p></div>
    <div class="head-actions">
      <button class="btn" data-act="act-copy-all">${icon('copy')}Copy whole CV</button>
      <button class="btn primary" data-act="new" data-col="activities">${icon('plus')}Add activity</button>
    </div>
  </header>
  <div class="toolbar">
    <div class="search">${icon('search')}<input id="act-search" data-ui="actSearch" value="${esc(ui.actSearch || '')}" placeholder="Filter activities…" autocomplete="off"></div>
    ${hidden ? `<label class="check"><input type="checkbox" data-act-change="act-hidden" ${ui.actShowHidden ? 'checked' : ''}> Show ${hidden} hidden from CV</label>` : ''}
  </div>
  ${!total ? empty('No activities yet', 'Add leadership roles, volunteering, awards, events…', `<button class="btn primary" data-act="new" data-col="activities">${icon('plus')}Add activity</button>`) : `
  <article class="cv-paper">
    ${shown.map((sec) => `<section class="cv-sec">
      <header class="cv-head"><h2>${esc(sec.label)}</h2>
        <span class="cv-tools"><button class="icon-btn sm" data-act="act-copy" data-cat="${sec.id}" title="Copy this section">${icon('copy')}</button>
        <button class="icon-btn sm" data-act="new" data-col="activities" data-preset='{"category":"${sec.id}"}' title="Add to ${esc(sec.label)}">${icon('plus')}</button></span></header>
      ${sec.items.map(entryHTML).join('')}</section>`).join('')}
  </article>
  ${empties.length && !ui.actSearch ? `<div class="chips-row add-sections"><span class="muted small">Add a section:</span>${empties.map((sec) => `<button class="chip" data-act="new" data-col="activities" data-preset='{"category":"${sec.id}"}'>${icon('plus')}${esc(sec.label)}</button>`).join('')}</div>` : ''}`}`;
}

export const actions = {
  'act-copy-all': (_, { s, ui }) => copySections(grouped(s, { ...ui, actSearch: '', actShowHidden: false }).filter((x) => x.items.length)),
  'act-copy': (el, { s, ui }) => copySections(grouped(s, { ...ui, actSearch: '', actShowHidden: false }).filter((x) => x.id === el.dataset.cat && x.items.length)),
};
