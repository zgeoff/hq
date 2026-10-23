// The owner's unblock list: things that need their hands (a live check, a setup
// step), ranked by what they unblock.
import type { Priority } from './priorities.ts';

export interface Unblocked {
  issue: string;
  priority: Priority;
}

// release: owner/repo, settled by a release published after the item was added; date: an ISO time.
export interface DoneWhen {
  kind: 'issue' | 'pr' | 'doc' | 'release' | 'date';
  ref: string;
}

// owner: the item needs the owner's hands; watch: it waits on an event and stays off their lists.
export type UnblockKind = 'owner' | 'watch';

export interface UnblockItem {
  id: string;
  task: string;
  minutes: number | null;
  unblocks: Unblocked[];
  rank: number | null;
  notify: string[];
  added_by: string;
  state: 'open' | 'done' | 'dropped';
  added_seq: number;
  added_at: string;
  closed_at: string | null;
  note: string | null;
  updated_at: string;
  title: string | null;

  // The console's JSON fields as stored (item.ts parseStoredExtras reads them); NULL: filed as a task.
  item: string | null;
  due_at: string | null;
  done_when: DoneWhen[];
  kind: UnblockKind;
  deadline: string | null;
  overdue_told_at: string | null;
}

export type Row = Omit<UnblockItem, 'unblocks' | 'notify' | 'done_when'> & { unblocks: string; notify: string; done_when: string | null };

export interface UnblockInput {
  id: string | null;
  task: string;
  minutes: number | null;
  unblocks: Unblocked[];
  // undefined keeps the stored rank, so the check's re-add never undoes `hq unblock rank`.
  rank?: number | null | undefined;
  notify: string[];
  actor: string;

  // Set by applyUnblockItem, which writes the title and item itself. Left out, the add is a plain
  // task, which replaces the console's fields, and with them any subject PR that would drop it.
  fromItem?: boolean;

  // undefined keeps the stored conditions of an open item; given, they are added to them.
  doneWhen?: DoneWhen[];

  // undefined keeps an open item's stored kind and deadline; a new or reopened item takes owner and
  // no deadline.
  kind?: UnblockKind;
  deadline?: string | null;
}

// A closed item that already unblocked one of the same issues. A reworded
// waiting-on-the-owner line can come back as a new item; the warning names the old one.
export interface UnblockWarning {
  issue: string;
  id: string;
  state: 'done' | 'dropped';
  closed_at: string | null;
  task: string;
}

export type ConditionVerdict = { kind: 'settled'; what: string } | { kind: 'waiting' } | { kind: 'failed'; error: string };
