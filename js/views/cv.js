// Auto-formatted publication + presentation lists you can paste into a CV or application.
import { esc, fmtDate, fmtRange, safeUrl } from '../util.js';
import { presType, currentSubmission } from '../model.js';
import { icon, empty } from '../ui.js';

const PRIVATE = /(docs|drive|mail)\.google\.com|dropbox|onedrive|sharepoint|box\.com/i;
// Prefer a DOI; otherwise the first public-looking link (never a private Drive/Docs/Gmail link).
const citeLink = (p) => {
  const urls = (p.links || []).map((x) => safeUrl(x.url)).filter(Boolean);
  return urls.find((u) => /doi\.org\//i.test(u)) || urls.find((u) => !PRIVATE.test(u)) || '';
};
const end = (s) => (s && !/[.?!]$/.test(s.trim()) ? s.trim() + '.' : (s || '').trim());
const join = (parts) => parts.filter(Boolean).join(' ');

export function sections(s, { includeReview = true } = {}) {
  const pubs = s.projects.filter((p) => p.stage === 'published');
  const review = s.projects.filter((p) => ['submitted', 'revision', 'accepted'].includes(p.stage));
  const done = s.presentations.filter((p) => ['presented', 'accepted'].includes(p.status)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pres = (types) => done.filter((p) => types.some((t) => p.types?.includes(t)));

  const pubLine = (p) => join([p.authors && esc(end(p.authors)), esc(end(p.title)), p.venue && `<i>${esc(p.venue)}</i>.`, esc(citeLink(p))]);
  const reviewLine = (p) => {
    const venue = currentSubmission(p)?.venue || p.venue;
    const st = p.stage === 'accepted' ? 'Accepted' : p.stage === 'revision' ? 'Revise & resubmit' : 'Under review';
    return join([p.authors && esc(end(p.authors)), esc(end(p.title)), `${st}${venue ? `, <i>${esc(venue)}</i>` : ''}.`]);
  };
  const presLine = (p) => {
    const when = !p.date ? '' : p.monthOnly ? fmtDate(p.date, { monthOnly: true, long: true }) : fmtRange(p.date, p.endDate);
    const kind = (p.types || []).map((t) => presType(t).label).join(' / ');
    return join([p.authors && end(p.authors), end(p.title), end([p.conference, p.location, when].filter(Boolean).join(', ')), kind && `(${kind})`].map((x) => x && esc(x)));
  };

  const out = [{ title: 'Peer-reviewed publications', items: pubs.map(pubLine) }];
  if (includeReview) out.push({ title: 'Manuscripts under review', items: review.map(reviewLine) });
  out.push(
    { title: 'Oral presentations & workshops', items: pres(['oral', 'workshop']).map(presLine) },
    { title: 'Poster presentations', items: pres(['poster']).map(presLine) },
    { title: 'Published abstracts', items: pres(['abstract']).map(presLine) }
  );
  return out.filter((x) => x.items.length);
}

export function render(s, ui) {
  const secs = sections(s, { includeReview: ui.cvReview !== false });
  const missingAuthors = s.projects.filter((p) => p.stage === 'published' && !p.authors).length;
  return `
  <header class="page-head"><div><h1>CV export</h1><p class="muted">Auto-built from your projects and presentations. Copy straight into your CV, ERAS, or applications.</p></div>
    <div class="head-actions"><button class="btn primary" data-act="copy-cv">${icon('copy')}Copy all</button></div></header>
  <div class="toolbar"><label class="check"><input type="checkbox" data-act-change="cv-review" ${ui.cvReview !== false ? 'checked' : ''}> Include manuscripts under review</label></div>
  ${missingAuthors ? `<div class="hint">${icon('alert')}<span>${missingAuthors} published item${missingAuthors > 1 ? 's are' : ' is'} missing an author list. Open the project and fill in “Author list (for CV)” to get full citations.</span></div>` : ''}
  <div id="cv-out" class="card cv">${secs.length ? secs
    .map((x) => `<h2>${esc(x.title)} <span class="count">${x.items.length}</span></h2><ol>${x.items.map((i) => `<li>${i}</li>`).join('')}</ol>`)
    .join('') : empty('Nothing to export yet')}</div>`;
}
