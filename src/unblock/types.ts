import type { Priority } from './priorities.ts';

export interface Unblocked {
  issue: string;
  priority: Priority;
}

export interface DoneWhen {
  kind: 'issue' | 'pr' | 'doc' | 'release' | 'date';
  ref: string;
}

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

  fromItem?: boolean;

  doneWhen?: DoneWhen[];

  kind?: UnblockKind;
  deadline?: string | null;
}

export interface UnblockWarning {
  issue: string;
  id: string;
  state: 'done' | 'dropped';
  closed_at: string | null;
  task: string;
}

export type ConditionVerdict = { kind: 'settled'; what: string } | { kind: 'waiting' } | { kind: 'failed'; error: string };
