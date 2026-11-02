import { expect, test } from 'bun:test';
import { pickLowWater } from './pick-low-water.ts';

const base = { eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', freshMinutes: 30, at: new Date('2026-10-14T01:10:00Z') };

test('it sets the mark to 3 when fewer slots are free', () => {
  expect(pickLowWater(base)).toStrictEqual({ mark: 3, phase: 'low' });
});

test('it sets the mark to the free slots when more than 3 are free', () => {
  expect(pickLowWater({ ...base, free: 5, eligible: 4 })).toStrictEqual({ mark: 5, phase: 'low' });
});

test('it ends the episode when eligible work reaches the mark', () => {
  expect(pickLowWater({ ...base, eligible: 3 })).toStrictEqual({ mark: 3, phase: 'above' });
});

test('it is unclear when the promotable count is missing, null, zero, stale or for another focus', () => {
  const phases = [
    pickLowWater({ ...base, promotable: null }),
    pickLowWater({ ...base, promotable: { ...base.promotable, count: null } }),
    pickLowWater({ ...base, promotable: { ...base.promotable, count: 0 } }),
    pickLowWater({ ...base, at: new Date('2026-10-14T01:31:00Z') }),
    pickLowWater({ ...base, focus: '["bug"]' }),
  ].map((pick) => pick.phase);

  expect(phases).toStrictEqual(['unclear', 'unclear', 'unclear', 'unclear', 'unclear']);
});
