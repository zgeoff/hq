import { expect, test } from 'bun:test';
import { buildHandedInPlan } from './build-handed-in-plan.ts';

test('it ends every stored session the wrap-up forgot, reports, and tries the move to merged', () => {
  const plan = buildHandedInPlan({
    ids: ['0000f001', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    wrapUp: { forgotten: ['0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] },
    lastKeptData: null,
    mergedClaimed: false,
  });

  expect(plan).toStrictEqual({ end: ['0000f001', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: null, report: true, tryMergedUpdate: true });
});

test('it ends the forgotten sessions of a partial wrap-up and logs the kept ones, sorted by id', () => {
  const plan = buildHandedInPlan({
    ids: ['0000f001', '0000f002', '0000f003'],
    wrapUp: {
      forgotten: ['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      destroyed: [],
      kept: [{ id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }],
      failed: [
        { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc refused the forget' },
        { id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc refused the forget' },
      ],
    },
    lastKeptData: null,
    mergedClaimed: false,
  });

  expect(plan).toStrictEqual({
    end: ['0000f001'],
    kept: {
      kept: [{ id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }],
      failed: [
        { id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc refused the forget' },
        { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc refused the forget' },
      ],
    },
    report: true,
    tryMergedUpdate: true,
  });
});

test('it ends nothing and reports a wrap-up that forgot nothing for a new reason', () => {
  const plan = buildHandedInPlan({
    ids: ['0000f001'],
    wrapUp: { forgotten: [], destroyed: [], kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] },
    lastKeptData: JSON.stringify({ kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'the owner chats on this run' }], failed: [] }),
    mergedClaimed: false,
  });

  expect(plan).toStrictEqual({ end: [], kept: { kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] }, report: true, tryMergedUpdate: false });
});

test('it does not report a wrap-up that forgot nothing for the reason already reported', () => {
  const plan = buildHandedInPlan({
    ids: ['0000f001'],
    wrapUp: { forgotten: [], destroyed: [], kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] },
    lastKeptData: JSON.stringify({ kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] }),
    mergedClaimed: false,
  });

  expect(plan.report).toBe(false);
});

test('it reports a wrap-up that forgot nothing for the reason already reported when it claimed the merged wrap-up', () => {
  const plan = buildHandedInPlan({
    ids: ['0000f001'],
    wrapUp: { forgotten: [], destroyed: [], kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] },
    lastKeptData: JSON.stringify({ kept: [{ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] }),
    mergedClaimed: true,
  });

  expect(plan.report).toBe(true);
});
