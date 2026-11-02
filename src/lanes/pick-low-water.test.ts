import { expect, test } from 'bun:test';
import { pickLowWater } from './pick-low-water.ts';

function setupTest() {
  return { base: { eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', freshMinutes: 30, at: new Date('2026-10-14T01:10:00Z') } };
}

test('it sets the mark to 3 when fewer slots are free', () => {
  const ctx = setupTest();

  expect(pickLowWater(ctx.base)).toStrictEqual({ mark: 3, phase: 'low' });
});

test('it sets the mark to the free slots when more than 3 are free', () => {
  const ctx = setupTest();

  expect(pickLowWater({ ...ctx.base, free: 5, eligible: 4 })).toStrictEqual({ mark: 5, phase: 'low' });
});

test('it ends the episode when eligible work reaches the mark', () => {
  const ctx = setupTest();

  expect(pickLowWater({ ...ctx.base, eligible: 3 })).toStrictEqual({ mark: 3, phase: 'above' });
});

test('it is unclear when the promotable count is missing, null, zero, stale or for another focus', () => {
  const ctx = setupTest();
  const phases = [
    pickLowWater({ ...ctx.base, promotable: null }),
    pickLowWater({ ...ctx.base, promotable: { ...ctx.base.promotable, count: null } }),
    pickLowWater({ ...ctx.base, promotable: { ...ctx.base.promotable, count: 0 } }),
    pickLowWater({ ...ctx.base, at: new Date('2026-10-14T01:31:00Z') }),
    pickLowWater({ ...ctx.base, focus: '["bug"]' }),
  ].map((pick) => pick.phase);

  expect(phases).toStrictEqual(['unclear', 'unclear', 'unclear', 'unclear', 'unclear']);
});
