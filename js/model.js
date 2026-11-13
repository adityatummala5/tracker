// Data definitions, defaults, and derived queries.
import { uid, nowISO, todayISO, localISO, minutesBetween, daysSince, parseISO, daysFromToday } from './util.js';

export const STAGES = [
  { id: 'planning', label: 'Planning', tone: 'slate' },
  { id: 'in_progress', label: 'In progress', tone: 'blue' },
  { id: 'submitted', label: 'Under review', tone: 'amber' },
  { id: 'revision', label: 'Revise & resubmit', tone: 'orange' },
  { id: 'accepted', label: 'Accepted', tone: 'teal' },
  { id: 'published', label: 'Published', tone: 'green' },
  { id: 'paused', label: 'Paused', tone: 'gray' },
];
export const stage = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const ACTIVE_STAGES = ['planning', 'in_progress', 'submitted', 'revision', 'accepted'];

export const OUTCOMES = [
  { id: 'pending', label: 'Under review', tone: 'amber' },
  { id: 'revise', label: 'Revise & resubmit', tone: 'orange' },
  { id: 'accepted', label: 'Accepted', tone: 'green' },
  { id: 'rejected', label: 'Rejected', tone: 'red' },
  { id: 'desk_rejected', label: 'Desk rejected', tone: 'red' },
  { id: 'withdrawn', label: 'Withdrawn', tone: 'gray' },
];
export const outcome = (id) => OUTCOMES.find((o) => o.id === id) || OUTCOMES[0];

export const PRES_TYPES = [
  { id: 'abstract', label: 'Abstract', tone: 'violet' },
  { id: 'poster', label: 'Poster', tone: 'blue' },
  { id: 'oral', label: 'Oral', tone: 'teal' },
  { id: 'workshop', label: 'Workshop', tone: 'orange' },
];
export const presType = (id) => PRES_TYPES.find((t) => t.id === id) || { id, label: id, tone: 'gray' };

export const PRES_STATUS = [
  { id: 'planned', label: 'Planning to submit', tone: 'slate' },
  { id: 'submitted', label: 'Submitted', tone: 'amber' },
  { id: 'accepted', label: 'Accepted', tone: 'teal' },
  { id: 'presented', label: 'Presented', tone: 'green' },
  { id: 'declined', label: 'Not accepted', tone: 'red' },
];
export const presStatus = (id) => PRES_STATUS.find((s) => s.id === id) || PRES_STATUS[0];

export const COLLECTION_LABEL = { projects: 'Project', presentations: 'Presentation', ideas: 'Idea', tasks: 'Task', timelog: 'Time entry', activities: 'Activity' };

// CV sections for the Activities page, in the order they appear on a CV.
// style: 'entry' = Organization | Location / dates / role / bullets; 'line' = one line each (honors); 'skills' = "Label: text".
export const CATEGORIES = [
  { id: 'education', label: 'Education', style: 'entry' },
  { id: 'research', label: 'Research Experience', style: 'entry' },
  { id: 'clinical', label: 'Clinical Experience', style: 'entry' },
  { id: 'work', label: 'Work & Teaching Experience', style: 'entry' },
  { id: 'leadership', label: 'Leadership', style: 'entry' },
  { id: 'innovation', label: 'Entrepreneurship & Competitions', style: 'entry' },
  { id: 'service', label: 'Community Service & Global Health', style: 'entry' },
  { id: 'extracurricular', label: 'Extracurriculars & Athletics', style: 'entry' },
  { id: 'events', label: 'Events & Conferences Attended', style: 'entry' },
  { id: 'honors', label: 'Honors & Awards', style: 'line' },
  { id: 'skills', label: 'Skills & Interests', style: 'skills' },
];
export const category = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.find((c) => c.id === 'leadership');

// ---------- factories ----------
const stamp = () => ({ id: uid(), createdAt: nowISO(), updatedAt: nowISO() });

export const newProject = (o = {}) => ({
  ...stamp(), title: '', stage: 'planning', venue: '', authors: '', collaborators: '', dueDate: '', waitingOn: '',
  tags: [], links: [], submissions: [], log: [], notes: '', ...o,
});
export const newPresentation = (o = {}) => ({
  ...stamp(), title: '', conference: '', location: '', date: '', endDate: '', monthOnly: false, types: [],
  status: 'planned', deadline: '', projectId: '', authors: '', links: [], notes: '', ...o,
});
export const newIdea = (o = {}) => ({ ...stamp(), text: '', notes: '', tags: [], links: [], ...o });
export const newTask = (o = {}) => ({ ...stamp(), text: '', done: false, dueDate: '', projectId: '', doneAt: '', ...o });
export const newActivity = (o = {}) => ({
  ...stamp(), title: '', organization: '', location: '', category: 'leadership', start: '', end: '', current: false, dateText: '',
  bullets: [], hours: '', links: [], tags: [], onCv: true, notes: '', ...o,
});
export const newTime = (o = {}) => ({ ...stamp(), projectId: '', date: todayISO(), start: '', end: '', note: '', ...o });

// ---------- queries ----------
export const byId = (list, id) => list.find((x) => x.id === id);
export const projectTitle = (s, id) => byId(s.projects, id)?.title || '';

export function stats(s) {
  const count = (fn) => s.projects.filter(fn).length;
  const counted = s.presentations.filter((p) => ['accepted', 'presented'].includes(p.status));
  const pres = (...t) => counted.filter((p) => t.some((x) => p.types?.includes(x))).length;
  return {
    published: count((p) => p.stage === 'published'),
    pending: count((p) => ['submitted', 'revision', 'accepted'].includes(p.stage)),
    inProgress: count((p) => ['planning', 'in_progress'].includes(p.stage)),
    abstracts: pres('abstract'),
    posters: pres('poster'),
    orals: pres('oral', 'workshop'),
  };
}

export const currentSubmission = (p) => [...(p.submissions || [])].reverse().find((x) => ['pending', 'revise', 'accepted'].includes(x.outcome));

export const openTasks = (s, projectId) =>
  s.tasks.filter((t) => !t.done && (projectId === undefined || t.projectId === projectId)).sort(taskSort);

export function taskSort(a, b) {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

export const allTags = (s) => [...new Set(s.projects.flatMap((p) => p.tags || []))].sort((a, b) => a.localeCompare(b));

export const entryMinutes = (e) => minutesBetween(e.start, e.end);

export function minutesSince(s, fromISO, projectId) {
  return s.timelog.filter((e) => e.date >= fromISO && (!projectId || e.projectId === projectId)).reduce((n, e) => n + entryMinutes(e), 0);
}

export function weekStartISO() {
  const d = parseISO(todayISO());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return localISO(d);
}

/** Things that probably need you: overdue tasks, stale projects, blocked items. */
export function attention(s) {
  const items = [];
  for (const t of s.tasks) {
    if (!t.done && t.dueDate && daysFromToday(t.dueDate) < 0) items.push({ kind: 'overdue', ref: ['tasks', t.id], text: t.text, due: t.dueDate });
  }
  for (const p of s.presentations) {
    if (p.deadline && ['planned'].includes(p.status) && daysFromToday(p.deadline) >= 0 && daysFromToday(p.deadline) <= 21)
      items.push({ kind: 'deadline', ref: ['presentations', p.id], text: `Abstract deadline: ${p.conference || p.title}`, due: p.deadline });
  }
  for (const p of s.projects) {
    if (p.dueDate && ACTIVE_STAGES.includes(p.stage) && daysFromToday(p.dueDate) < 0)
      items.push({ kind: 'overdue', ref: ['projects', p.id], text: p.title, due: p.dueDate });
    if (p.waitingOn && ACTIVE_STAGES.includes(p.stage)) items.push({ kind: 'waiting', ref: ['projects', p.id], text: p.title, who: p.waitingOn });
    else if (['in_progress', 'revision'].includes(p.stage) && daysSince(p.updatedAt) > 30)
      items.push({ kind: 'stale', ref: ['projects', p.id], text: p.title, days: Math.floor(daysSince(p.updatedAt)) });
    else if (p.stage === 'submitted') {
      const sub = currentSubmission(p);
      if (sub?.date && -daysFromToday(sub.date) > 90)
        items.push({ kind: 'review', ref: ['projects', p.id], text: p.title, days: -daysFromToday(sub.date), venue: sub.venue });
    }
  }
  return items;
}

/** Dated things in the future (next 60 days), soonest first. */
export function upcoming(s, days = 60) {
  const out = [];
  const inRange = (d) => d && daysFromToday(d) >= 0 && daysFromToday(d) <= days;
  for (const t of s.tasks) if (!t.done && inRange(t.dueDate)) out.push({ date: t.dueDate, kind: 'Task', text: t.text, ref: ['tasks', t.id] });
  for (const p of s.presentations) {
    if (inRange(p.date)) out.push({ date: p.date, kind: 'Conference', text: p.conference || p.title, ref: ['presentations', p.id] });
    if (inRange(p.deadline) && p.status === 'planned') out.push({ date: p.deadline, kind: 'Abstract due', text: p.conference || p.title, ref: ['presentations', p.id] });
  }
  for (const p of s.projects) if (inRange(p.dueDate) && ACTIVE_STAGES.includes(p.stage)) out.push({ date: p.dueDate, kind: 'Project due', text: p.title, ref: ['projects', p.id] });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- activities ----------
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2023-02" -> "February 2023"; "2024" -> "2024". */
export function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = String(ym).split('-').map(Number);
  return m ? `${MONTHS_LONG[m - 1]} ${y}` : String(y);
}
/** CV date range: "February 2023 – Present", "May 2024 – August 2024", "February 2024". */
export function activityDates(a) {
  if (a.dateText) return a.dateText;
  const s = fmtMonth(a.start), e = a.current ? 'Present' : fmtMonth(a.end);
  if (s && e && s !== e) return `${s} – ${e}`;
  return s || e || '';
}
/** CV order: ongoing first, then most recently ended, then most recently started; undated items keep the order they were added. */
export function activitySort(a, b) {
  const year = (x) => (String(x.dateText || '').match(/(19|20)\d{2}(?!.*(19|20)\d{2})/) || [''])[0]; // last year in custom text
  const endKey = (x) => (x.current ? '9999' : x.end || x.start || year(x) || '0000');
  return endKey(b).localeCompare(endKey(a)) || (b.start || '').localeCompare(a.start || ''); // ties keep the order they were added
}
