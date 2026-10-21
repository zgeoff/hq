// Calls (from z-triage's check; z-refine's before the merge) and proposals (from z-steward): the questions put to
// the owner, one at a time. Every change is a named transition, logged in events.
import type { AskState } from '../transitions/ask-states.ts';
import type { AskAction } from '../transitions/ask-transitions.ts';
import type { ItemExtras } from '../parse-item-input.ts';

export type Kind = 'call' | 'proposal';

export interface Ask {
  id: string;
  kind: Kind;
  title: string;
  question: string;
  body: string;
  issues: string[];
  filed_by: string;
  for_session: string | null;
  state: AskState;
  round: number;
  send_order: number | null;
  due_at: string | null;
  answer: string | null;
  answered_at: string | null;
  applied_to: string | null;
  applied_note: string | null;
  applied_at: string | null;
  close_reason: string | null;
  queued_at: string;
  opened_at: string | null;
  created_at: string;
  updated_at: string;
  item: ItemExtras | null;
  stu_view: string | null;
}

export type Row = Omit<Ask, 'issues' | 'item'> & { issues: string; item: string | null };

export interface AddInput {
  kind: Kind;
  id: string;
  title: string;
  question: string;
  body: string;
  issues: string[];
  forSession: string | null;
  // The filer's send order; lower opens first. undefined keeps the stored one.
  order?: number | null;
  actor: string;
}

export interface AddResult {
  ask: Ask;
  result: 'added' | 'requeued' | 'reasked' | 'updated' | 'noop';
  note?: string;
}

export interface Hold {
  reason: string;
  since: string;
  by: string;
}

// A message about an ask, for one target; the events row it follows is seq.
export interface Notice {
  seq: number;
  target: string | null;
  actor: string;
  text: string;
  topic?: string | null;
}

// One named transition on an ask: the table action, the columns it sets, the event data, and the
// notice the filer gets, if any.
export interface AskStep {
  id: string;
  kind: Kind | undefined;
  action: AskAction;
  actor: string;
  set: Record<string, string | null>;
  data: Record<string, unknown>;
  notice?: (a: Ask) => string | null;
}
