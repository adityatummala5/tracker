// Small helpers shared across the app. No dependencies.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const nowISO = () => new Date().toISOString();

const pad = (n) => String(n).padStart(2, '0');
export const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => localISO(new Date());
export const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const daysFromToday = (s) => Math.round((parseISO(s) - parseISO(todayISO())) / 86400000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDate(s, { monthOnly = false, long = false, year = true } = {}) {
  const d = parseISO(s);
  if (!d) return '';
  const m = (long ? MONTHS_LONG : MONTHS)[d.getMonth()];
  if (monthOnly) return `${m} ${d.getFullYear()}`;
  return year ? `${m} ${d.getDate()}, ${d.getFullYear()}` : `${m} ${d.getDate()}`;
}

export function fmtRange(start, end, monthOnly) {
  if (!start) return '';
  if (monthOnly) return fmtDate(start, { monthOnly: true });
  if (!end || end === start) return fmtDate(start);
  const a = parseISO(start), b = parseISO(end);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function relDays(s) {
  if (!s) return '';
  const n = daysFromToday(s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`;
  const a = -n;
  return a < 14 ? `${a} days ago` : a < 60 ? `${Math.round(a / 7)} weeks ago` : `${Math.round(a / 30)} months ago`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d < 30 ? `${d}d ago` : d < 365 ? `${Math.round(d / 30)}mo ago` : `${Math.round(d / 365)}y ago`;
}

export const daysSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);

// "09:30" -> minutes; handles sessions that cross midnight.
const hm = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : NaN;
};
export function minutesBetween(start, end) {
  const a = hm(start), b = hm(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return b >= a ? b - a : b + 1440 - a;
}
export function fmtDuration(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

// Only allow http(s)/mailto links; turn DOIs and bare domains into URLs.
export function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^doi:\s*/i.test(u)) return 'https://doi.org/' + u.replace(/^doi:\s*/i, '');
  if (/^10\.\d{4,}\//.test(u)) return 'https://doi.org/' + u;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) return 'https://' + u;
  return '';
}

export function guessLinkLabel(url) {
  const u = safeUrl(url);
  if (!u) return 'Link';
  let host = '';
  try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Link'; }
  if (host === 'doi.org') return 'DOI';
  if (host === 'docs.google.com') return u.includes('/spreadsheets/') ? 'Google Sheet' : u.includes('/presentation/') ? 'Google Slides' : 'Google Doc';
  if (host === 'drive.google.com') return u.includes('/folders/') ? 'Drive folder' : 'Drive file';
  if (host === 'mail.google.com') return 'Email thread';
  if (host === 'github.com') return 'GitHub';
  if (host.includes('overleaf')) return 'Overleaf';
  return host;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCSV(rows, cols) {
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => cell(c.label)).join(','), ...rows.map((r) => cols.map((c) => cell(c.get(r))).join(','))].join('\n');
}

export const splitTags = (s) => [...new Set(String(s || '').split(',').map((t) => t.trim()).filter(Boolean))];

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const plural = (n, word, pl = word + 's') => `${n} ${n === 1 ? word : pl}`;
