import { expect, test } from 'bun:test';
import { buildMockEventRow } from './build-mock-event-row.ts';

test('it builds a default event row', () => {
  expect(buildMockEventRow()).toStrictEqual({ subject: 'hq', subject_id: 'kettle', action: 'probe', from_state: null, to_state: null, actor: 'kettle-bot', at: '2026-10-14T01:00:00Z', data: '{}' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockEventRow({ subject_id: 'pr:widgets#7', data: '{"note":"Descaled."}' })).toStrictEqual({ subject: 'hq', subject_id: 'pr:widgets#7', action: 'probe', from_state: null, to_state: null, actor: 'kettle-bot', at: '2026-10-14T01:00:00Z', data: '{"note":"Descaled."}' });
});
