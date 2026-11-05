// Author lists from a DOI: Crossref first (has family/given names), OpenAlex as a fallback.
// Output is CV style: "Latif Z, Nelson B, Tummala A".
import { extractDoi } from './citations.js';

const PREPRINT = /^10\.(2139|48550|1101|36227|21203|20944|31219|31234|31235|26434|22541)\//;

const fixCase = (s) => (s && s === s.toUpperCase() && /[A-Z]{2}/.test(s) ? s.toLowerCase().replace(/(^|[\s'’-])\p{L}/gu, (m) => m.toUpperCase()) : s || '');
const initials = (given) => fixCase(given).split(/[\s.\-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('');
export const formatAuthor = (family, given) => [fixCase(family).trim(), initials(given)].filter(Boolean).join(' ');

/** Best DOI on an item for authorship: the journal version over a preprint. */
export function bestDoi(links = []) {
  const dois = [...new Set(links.map((l) => extractDoi(l.url)).filter(Boolean))];
  return dois.find((d) => !PREPRINT.test(d)) || dois[0] || '';
}

export async function fetchAuthors(doi) {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (r.ok) {
      const list = (await r.json()).message?.author || [];
      const names = list.map((a) => (a.family ? formatAuthor(a.family, a.given) : a.name || '')).filter(Boolean);
      if (names.length) return names.join(', ');
    }
  } catch {}
  const r = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=authorships`);
  if (!r.ok) throw new Error('No author data found for this DOI.');
  const names = ((await r.json()).authorships || []).map((a) => {
    const parts = String(a.author?.display_name || '').trim().split(/\s+/);
    return parts.length > 1 ? formatAuthor(parts.pop(), parts.join(' ')) : parts[0];
  }).filter(Boolean);
  if (!names.length) throw new Error('No author data found for this DOI.');
  return names.join(', ');
}
