import type { Row } from '../transitions/types.ts';
import type { SlotCauseName } from './types.ts';

// The stored cause of the empty slots: none while no cause holds.
export type SlotCauseState = SlotCauseName | 'unknown' | 'none';

const CAUSES = ['delivery', 'triage', 'supply', 'unknown'] as const satisfies readonly SlotCauseState[];

// The moves the stored cause makes. Every write to it checks its move against this table, so a move
// the table lacks cannot happen; a look whose cause matches the stored one writes nothing.
export const SLOT_CAUSE_TRANSITIONS = {
  'cause-began': { from: ['none'], to: CAUSES },
  'cause-changed': { from: CAUSES, to: CAUSES },
  'cause-ended': { from: CAUSES, to: 'none' },
} as const satisfies Record<string, Row<SlotCauseState>>;

export type SlotCauseAction = keyof typeof SLOT_CAUSE_TRANSITIONS;
