import { expect, test } from 'bun:test';
import { pickStatePill } from './pick-state-pill.ts';

test('an open row shows its status, a canceled one Canceled, and a done one no pill', () => {
  expect([pickStatePill({ state: 'open', status: 'In Progress' }), pickStatePill({ state: 'canceled', status: 'Canceled' }), pickStatePill({ state: 'closed', status: 'Done' })]).toStrictEqual(['In Progress', 'Canceled', null]);
});
