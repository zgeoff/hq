import type { AskState } from './ask-states.ts';
import type { Row } from './types.ts';

export const ASK_TRANSITIONS = {
  opened: { from: ['queued', 'later'], to: 'open' },
  answered: { from: ['open'], to: 'answered' },

  'answered-unopened': { from: ['queued', 'later'], to: 'answered' },
  applied: { from: ['answered'], to: 'applied' },
  later: { from: ['open', 'queued'], to: 'later' },
  skipped: { from: ['open', 'queued', 'answered'], to: 'skipped' },
  closed: { from: ['queued', 'open', 'later', 'skipped', 'answered'], to: 'closed' },
  reasked: { from: ['answered', 'applied', 'skipped', 'closed'], to: 'queued' },
  requeued: { from: ['skipped', 'closed'], to: 'queued' },
} as const satisfies Record<string, Row<AskState>>;
export type AskAction = keyof typeof ASK_TRANSITIONS;
