import type { HqTables } from '../db/hq-columns.ts';

export type EventRow = Omit<HqTables['events'], 'seq'>;

export function buildMockEventRow(overrides: Partial<EventRow> = {}): EventRow {
  return { subject: 'hq', subject_id: 'kettle', action: 'probe', from_state: null, to_state: null, actor: 'kettle-bot', at: '2026-10-14T01:00:00Z', data: '{}', ...overrides };
}
