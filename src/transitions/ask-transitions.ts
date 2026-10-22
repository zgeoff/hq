// One transition table per kind of record: asks, runs and run PRs. Every write to a state column
// checks its table first, so a move that is not listed here cannot happen (GEO-1053, J39).
import type { AskState } from './ask-states.ts';
import type { Row } from './types.ts';

// Action names are the event actions (what the log and the error message call the move).
export const ASK_TRANSITIONS = {
  opened: { from: ['queued', 'later'], to: 'open' },
  answered: { from: ['open'], to: 'answered' },

  // the console, while another item is open with the owner: they answer this one without its opening
  'answered-unopened': { from: ['queued', 'later'], to: 'answered' },
  applied: { from: ['answered'], to: 'applied' },
  later: { from: ['open', 'queued'], to: 'later' },
  skipped: { from: ['open', 'queued', 'answered'], to: 'skipped' },
  closed: { from: ['queued', 'open', 'later', 'skipped', 'answered'], to: 'closed' },
  // addAsk, same ask filed again with a new question
  reasked: { from: ['answered', 'applied', 'skipped', 'closed'], to: 'queued' },
  // addAsk, same ask filed again after a skip or close
  requeued: { from: ['skipped', 'closed'], to: 'queued' },
} as const satisfies Record<string, Row<AskState>>;
export type AskAction = keyof typeof ASK_TRANSITIONS;
