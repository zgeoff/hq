import { formatDoneWhen } from './format-done-when.ts';
import { isOverdue } from './is-overdue.ts';
import type { UnblockItem } from './types.ts';

export type OverdueItem = Pick<UnblockItem, 'id' | 'task' | 'state' | 'deadline' | 'overdue_told_at' | 'done_when' | 'added_by' | 'notify'>;

export interface OverdueAudience {
  actor: string;
  at: Date;
  ownerSession: string;
}

export interface OverdueNotice {
  deadline: string;
  sessions: string[];
  text: string;
}

export function pickOverdueNotice(item: OverdueItem, audience: OverdueAudience): OverdueNotice | null {
  if (item.deadline === null || item.overdue_told_at !== null || !isOverdue(item, audience.at)) {
    return null;
  }
  const waiting = item.done_when.length === 0 ? '' : ` and ${formatDoneWhen(item.done_when)} has not happened`;
  return {
    deadline: item.deadline,
    sessions: [...new Set([item.added_by, ...item.notify, audience.ownerSession])].filter((session) => session !== audience.actor),
    text: `"${item.task}" (unblock ${item.id}) is overdue: its deadline ${item.deadline} passed${waiting}.`,
  };
}
