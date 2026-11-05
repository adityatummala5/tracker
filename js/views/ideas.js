import { esc, timeAgo } from '../util.js';
import { newIdea } from '../model.js';
import { store } from '../store.js';
import { icon, tagChips, linkList, empty } from '../ui.js';

export function render(s) {
  const list = s.ideas.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `
  <header class="page-head"><div><h1>Ideas</h1><p class="muted">Capture now, decide later. Promote the good ones to projects.</p></div></header>
  <section class="card idea-add">
    <textarea id="idea-new" rows="2" placeholder="New idea… (⌘/Ctrl + Enter to save)" data-enter-meta="quick-idea"></textarea>
    <button class="btn primary" data-act="quick-idea">${icon('plus')}Add idea</button>
  </section>
  ${list.length ? `<div class="idea-grid">${list
    .map((i) => `<article class="icard" data-act="open" data-ref="ideas:${i.id}" tabindex="0">
      <div class="icard-text">${esc(i.text || 'Untitled idea')}</div>
      ${i.notes ? `<div class="muted small clamp2">${esc(i.notes)}</div>` : ''}
      ${linkList(i.links, { compact: true })}
      <div class="icard-foot">${tagChips(i.tags)}<span class="spacer"></span><span class="muted small">${timeAgo(i.createdAt)}</span>
        <button class="btn sm ghost" data-act="promote-idea" data-id="${i.id}" title="Turn into a project">${icon('rocket')}Start</button></div>
    </article>`)
    .join('')}</div>` : empty('No ideas yet', 'Jot down anything worth exploring.')}`;
}

export function quickAdd() {
  const el = document.getElementById('idea-new');
  const text = el?.value.trim();
  if (!text) return;
  store.update((s) => s.ideas.push(newIdea({ text })));
  el.value = '';
}
