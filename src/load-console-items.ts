// What the console's Needs you view shows: every call and proposal the owner can answer now, then every
// open unblock item, each as one Item (console brief). An item filed as free text shows its body as
// one details section and no options, so the owner answers it in the note box.
import type { Database } from 'bun:sqlite';
import type { Ask } from './asks/types.ts';
import { listAsks } from './asks/list-asks.ts';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import type { ItemDetail, ItemExtras, ItemOption } from './parse-item-input.ts';
import { parseStoredExtras } from './parse-stored-extras.ts';
import { findSubjectLink } from './find-subject-link.ts';
import { formatDoneWhen } from './unblock/format-done-when.ts';
import type { UnblockItem } from './unblock/types.ts';
import { listUnblocks } from './unblock/list-unblocks.ts';

type ConsoleKind = 'call' | 'proposal' | 'todo' | 'review';

// An option as the page shows it: noKey keeps it off the number keys, so only a click picks it.
type ConsoleOption = ItemOption & { noKey?: true };

export interface ConsoleItem {
  id: string;
  kind: ConsoleKind;
  title: string;
  question: string;
  deadline: string | null;
  time: string | null;
  options: ConsoleOption[];
  stuView: string | null;
  details: ItemDetail[];
  diff: { now: string; would: string } | null;
  unblocks: { id: string; title: string }[];
  links: { label: string; url: string }[];
}

// Calls and proposals that are open, queued, or put off and now due, in send order; then open unblock
// items that are not put off, in their list order.
export function loadConsoleItems(db: Database): ConsoleItem[] {
  const t = iso(now());
  return [...sortAsks(loadDueAsks(db, t)).map((a) => buildAskItem(a)), ...loadDueTodos(db, t).map((u) => buildUnblockItem(u))];
}

function loadDueAsks(db: Database, t: string): Ask[] {
  return listAsks(db, { states: ['open', 'queued', 'later'] }).filter((a) => a.state !== 'later' || (a.due_at !== null && a.due_at <= t));
}

function sortAsks(asks: Ask[]): Ask[] {
  return asks.toSorted((a, b) => (a.send_order ?? Infinity) - (b.send_order ?? Infinity) || a.queued_at.localeCompare(b.queued_at) || a.id.localeCompare(b.id));
}

function buildAskItem(a: Ask): ConsoleItem {
  const base = { id: a.id, kind: a.kind, title: a.title, question: a.question, stuView: a.stu_view };
  if (a.item === null) {
    return { ...base, deadline: null, time: null, options: [], details: [{ heading: 'Details', text: a.body }], diff: null, unblocks: [], links: [] };
  }
  return { ...base, ...buildFromExtras(a.item), options: a.item.options ?? [] };
}

function buildFromExtras(extras: ItemExtras): Pick<ConsoleItem, 'deadline' | 'time' | 'details' | 'diff' | 'unblocks' | 'links'> {
  return { deadline: extras.deadline ?? null, time: extras.time ?? null, details: extras.details, diff: extras.diff ?? null, unblocks: extras.unblocks, links: extras.links };
}

function loadDueTodos(db: Database, t: string): UnblockItem[] {
  return listUnblocks(db, 'open').filter((u) => u.due_at === null || u.due_at <= t);
}

function buildUnblockItem(u: UnblockItem): ConsoleItem {
  const asReview = findSubjectLink(u) !== null,
    base = { id: u.id, kind: asReview ? ('review' as const) : ('todo' as const), title: u.title ?? formatTitle(u.task), question: u.task, options: asReview ? buildReviewOptions() : buildTodoOptions(), stuView: null };
  const fields = buildUnblockFields(u, parseStoredExtras(u.item));
  const doneWhen = u.done_when.length > 0 ? [{ heading: 'Done when', text: formatDoneWhen(u.done_when, '\n') }] : [];
  return { ...base, ...fields, details: [...fields.details, ...doneWhen] };
}

function buildTodoOptions(): ItemOption[] {
  return [
    { label: 'Done', effect: 'Marks it done and tells the sessions waiting on it.' },
    { label: 'Later', effect: 'Hides it until 07:00 tomorrow.' },
    { label: 'Skip', effect: 'Drops it: it no longer needs you.' },
  ];
}

// An item with a subject PR is that PR's review (GEO-1324): the owner answers in review words.
function buildReviewOptions(): ConsoleOption[] {
  return [
    { label: 'lgtm', effect: 'Approves the merge; a note goes along as tweaks to make first.' },
    { label: 'Changes', effect: 'Needs a note: nothing merges, and it goes back to the agent.' },
    { label: 'Later', effect: 'Hides it until 07:00 tomorrow.' },
    { label: 'Reject', effect: 'Stu has the PR closed.', noKey: true },
  ];
}

function formatTitle(text: string): string {
  const cut = 80,
    line = text.split('\n', 1)[0] ?? '';
  return line.length <= cut ? line : `${line.slice(0, cut - 1)}…`;
}

function buildUnblockFields(u: UnblockItem, stored: ItemExtras | null): Pick<ConsoleItem, 'deadline' | 'time' | 'details' | 'diff' | 'unblocks' | 'links'> {
  if (stored === null) {
    return { deadline: null, time: formatMinutes(u.minutes), details: [], diff: null, unblocks: u.unblocks.map((x) => ({ id: x.issue, title: `${x.priority} priority` })), links: [] };
  }
  const extras = buildFromExtras(stored);
  return { ...extras, time: extras.time ?? formatMinutes(u.minutes) };
}

function formatMinutes(minutes: number | null): string | null {
  return minutes === null ? null : `about ${minutes} min`;
}
