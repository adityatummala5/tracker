// Citation counts from OpenAlex (free, no key, works from the browser), using the DOIs in your links.
// Google Scholar has no API, so its numbers are entered by hand (state.scholar) and shown alongside.
//
// What counts as one "item" for the h-index (mirrors how Scholar groups things):
//   - a published project: every DOI on it (journal version + preprint) is merged into one item
//   - an unpublished project with a preprint DOI (SSRN, TechRxiv, arXiv, medRxiv…): a preprint item
//   - a presentation whose abstract has a DOI (e.g. JACC/Circulation supplements): an abstract item

import { safeUrl } from './util.js';

const KEY = 'rt:cites';
const TTL = 12 * 3600 * 1000;
const API = 'https://api.openalex.org/works';

// DOI prefixes of preprint servers.
const PREPRINT_PREFIX = ['10.2139/', '10.48550/', '10.1101/', '10.36227/', '10.21203/', '10.20944/', '10.31219/', '10.31234/', '10.31235/', '10.26434/', '10.22541/', '10.2196/preprints'];
const isPreprintDoi = (d) => PREPRINT_PREFIX.some((p) => d.startsWith(p));

export function extractDoi(url) {
  const u = safeUrl(url);
  if (!u) return '';
  let m;
  if ((m = u.match(/ssrn\.com\/(?:abstract=|sol3\/papers\.cfm\?abstract_id=)(\d+)/i))) return `10.2139/ssrn.${m[1]}`;
  if ((m = u.match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:v\d+)?(?:\.pdf)?$/i))) return `10.48550/arxiv.${m[1]}`.toLowerCase();
  if (!(m = u.match(/(10\.\d{4,9}\/[^\s?#&]+)/))) return '';
  let doi = decodeURIComponent(m[1]).replace(/[.,;)\]]+$/, '');
  if (/(bio|med)rxiv\.org/i.test(u)) doi = doi.replace(/v\d+(\.full.*|\.pdf)?$/i, '').replace(/\.full.*$/i, '');
  return doi.toLowerCase();
}

const doisOf = (links = []) => [...new Set(links.map((l) => extractDoi(l.url)).filter(Boolean))];

// ---------- cache ----------
let cache = { works: {}, fetchedAt: null, error: '' };
try { cache = { ...cache, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} };
export const citeCache = () => cache;

/** Every DOI anywhere in projects or presentations. */
export function allDois(s) {
  return [...new Set([...s.projects, ...s.presentations].flatMap((x) => doisOf(x.links)))];
}

/** Group DOIs into citable items (see top of file). */
export function citableItems(s) {
  const claimed = new Set();
  const items = [];
  const typeOf = (d) => cache.works[d]?.type;
  for (const p of s.projects) {
    const dois = doisOf(p.links);
    if (!dois.length) continue;
    if (p.stage === 'published' || p.stage === 'accepted') {
      dois.forEach((d) => claimed.add(d));
      items.push({ kind: 'paper', ref: ['projects', p.id], title: p.title, dois });
    } else {
      const pre = dois.filter((d) => isPreprintDoi(d) || typeOf(d) === 'preprint');
      if (!pre.length) continue;
      pre.forEach((d) => claimed.add(d));
      items.push({ kind: 'preprint', ref: ['projects', p.id], title: p.title, dois: pre });
    }
  }
  for (const p of s.presentations) {
    const dois = doisOf(p.links).filter((d) => !claimed.has(d));
    if (!dois.length) continue;
    dois.forEach((d) => claimed.add(d));
    items.push({ kind: 'abstract', ref: ['presentations', p.id], title: p.title, dois });
  }
  return items;
}

/** Citation count for one item: sum over distinct OpenAlex works (dedupes DOIs that resolve to the same work). */
function countFor(item) {
  const seen = new Set();
  let n = 0, indexed = false;
  for (const d of item.dois) {
    const w = cache.works[d];
    if (!w) continue;
    indexed = true;
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    n += w.n;
  }
  return { cites: n, indexed };
}

export function metrics(s) {
  const items = citableItems(s).map((it) => ({ ...it, ...countFor(it) })).sort((a, b) => b.cites - a.cites);
  const counted = items.filter((i) => i.indexed);
  const sorted = counted.map((i) => i.cites).sort((a, b) => b - a);
  const h = sorted.filter((c, i) => c >= i + 1).length;
  const kinds = { paper: 0, preprint: 0, abstract: 0 };
  for (const i of counted) kinds[i.kind]++;
  const noDoi = s.projects.filter((p) => p.stage === 'published' && !doisOf(p.links).length);
  const missing = new Set(cache.missing || []);
  const notIndexed = items.filter((i) => !i.indexed && i.dois.every((d) => missing.has(d)));
  return {
    items: counted, total: sorted.reduce((a, b) => a + b, 0), h, i10: sorted.filter((c) => c >= 10).length,
    kinds, noDoi, notIndexed, fetchedAt: cache.fetchedAt, error: cache.error, loading: !!inflight,
  };
}

/** Citations for a single project/presentation (for cards + drawer). */
export function citesFor(s, col, id) {
  const it = citableItems(s).find((i) => i.ref[0] === col && i.ref[1] === id);
  return it ? { ...countFor(it), kind: it.kind } : null;
}

// ---------- fetching ----------
let inflight = null;
let lastAttempt = 0;
const notify = () => window.dispatchEvent(new CustomEvent('rt:cites'));

/** Fetch anything missing (or everything, if stale/forced). Batches 40 DOIs per request. */
export function refresh(s, { force = false } = {}) {
  if (inflight || !s) return inflight;
  const stale = !cache.fetchedAt || Date.now() - new Date(cache.fetchedAt).getTime() > TTL;
  const dois = allDois(s);
  const todo = force || stale ? dois : dois.filter((d) => !(d in cache.works));
  if (!todo.length) return null;
  lastAttempt = Date.now();
  inflight = (async () => {
    notify();
    try {
      const found = {};
      for (let i = 0; i < todo.length; i += 40) {
        const batch = todo.slice(i, i + 40);
        const url = `${API}?filter=doi:${batch.map(encodeURIComponent).join('|')}&select=id,doi,cited_by_count,type,publication_year&per-page=50`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`OpenAlex error ${res.status}`);
        for (const w of (await res.json()).results || []) {
          const d = String(w.doi || '').replace(/^https?:\/\/doi\.org\//i, '').toLowerCase();
          found[d] = { id: w.id, n: w.cited_by_count || 0, type: w.type, year: w.publication_year };
        }
      }
      // OpenAlex merges preprints into their published version (which has a different DOI),
      // so anything unmatched gets a direct lookup, which follows the merge.
      for (const d of todo.filter((x) => !found[x])) {
        const res = await fetch(`${API}/doi:${encodeURIComponent(d)}?select=id,doi,cited_by_count,type,publication_year`);
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`OpenAlex error ${res.status}`);
        const w = await res.json();
        found[d] = { id: w.id, n: w.cited_by_count || 0, type: w.type, year: w.publication_year };
      }
      for (const d of todo) {
        if (found[d]) cache.works[d] = found[d];
        else delete cache.works[d];
      }
      // Remember which DOIs OpenAlex doesn't know, so they aren't refetched on every render.
      cache.missing = [...new Set([...(cache.missing || []).filter((d) => !found[d]), ...todo.filter((d) => !found[d])])];
      if (force || stale) cache.fetchedAt = new Date().toISOString();
      cache.error = '';
    } catch (e) {
      cache.error = navigator.onLine ? "Couldn't reach OpenAlex." : "You're offline.";
      console.warn(e);
    } finally {
      save();
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

/** Called after every render: fetches only when there's something new, and never repeatedly. */
export function ensure(s) {
  if (!s || inflight || Date.now() - lastAttempt < 60000) return;
  const stale = !cache.fetchedAt || Date.now() - new Date(cache.fetchedAt).getTime() > TTL;
  const known = new Set([...Object.keys(cache.works), ...(cache.missing || [])]);
  const missing = allDois(s).filter((d) => !known.has(d));
  if (stale && !cache.error) refresh(s);
  else if (missing.length) refresh(s);
}
