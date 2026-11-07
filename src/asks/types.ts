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

export interface AddInput {
  kind: Kind;
  id: string;
  title: string;
  question: string;
  body: string;
  issues: string[];
  forSession: string | null;
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

export interface Notice {
  seq: number;
  target: string | null;
  actor: string;
  text: string;
  topic?: string | null;
}

export interface AskStep {
  id: string;
  kind: Kind | undefined;
  action: AskAction;
  actor: string;
  set: Record<string, string | null>;
  data: Record<string, unknown>;
  notice?: (a: Ask) => string | null;
}
