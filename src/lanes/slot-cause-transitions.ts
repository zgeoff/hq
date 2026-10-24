import type { Row } from '../transitions/types.ts';
import type { SlotCauseName } from './types.ts';

export type SlotCauseState = SlotCauseName | 'unknown' | 'none';

const CAUSES = ['delivery', 'triage', 'supply', 'unknown'] as const satisfies readonly SlotCauseState[];

export const SLOT_CAUSE_TRANSITIONS = {
  'cause-began': { from: ['none'], to: CAUSES },
  'cause-changed': { from: CAUSES, to: CAUSES },
  'cause-ended': { from: CAUSES, to: 'none' },
} as const satisfies Record<string, Row<SlotCauseState>>;

export type SlotCauseAction = keyof typeof SLOT_CAUSE_TRANSITIONS;
