import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import type { Runner } from '../runner/types.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { loadCostGoal } from './load-cost-goal.ts';
import { refreshActionsSpend } from './refresh-actions-spend.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

function makeGh(netAmount: number): Runner {
  return () => Promise.resolve({ code: 0, stdout: JSON.stringify({ usageItems: [{ product: 'actions', netAmount }] }), stderr: '' });
}

const OCT_16 = new Date('2026-10-16T07:00:00Z');

test('it is green with the month to date spend under the pro-rated budget', async () => {
  const db = setupTest();
  await refreshActionsSpend(db, makeGh(25.8), OCT_16);

  expect(loadCostGoal(db, DEFAULT_TARGETS.cost, OCT_16)).toStrictEqual({ text: 'Actions $25.80 of $25.81 budget to date', verdict: 'green' });
});

test('it is red with the month to date spend over the pro-rated budget', async () => {
  const db = setupTest();
  await refreshActionsSpend(db, makeGh(25.82), OCT_16);

  expect(loadCostGoal(db, DEFAULT_TARGETS.cost, OCT_16)).toStrictEqual({ text: 'Actions $25.82 of $25.81 budget to date', verdict: 'red' });
});

test('it shows the spend as unknown, with no colour, when the read failed', async () => {
  const db = setupTest();
  await refreshActionsSpend(db, () => Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 403' }), OCT_16);

  expect(loadCostGoal(db, DEFAULT_TARGETS.cost, OCT_16)).toStrictEqual({ text: 'Actions spend unknown', verdict: 'none' });
});

test('it shows the spend as unknown when there is no reading', () => {
  const db = setupTest();

  expect(loadCostGoal(db, DEFAULT_TARGETS.cost, OCT_16)).toStrictEqual({ text: 'Actions spend unknown', verdict: 'none' });
});

test('it gives the spend no colour when the review cleared the target', async () => {
  const db = setupTest();
  await refreshActionsSpend(db, makeGh(3), OCT_16);

  expect(loadCostGoal(db, null, OCT_16)).toStrictEqual({ text: 'Actions $3.00 this month', verdict: 'none' });
});

test('it compares in whole cents, so 0.1 and 0.2 meet a budget of exactly 0.30', async () => {
  const db = setupTest(),
    lastDay = new Date('2026-10-31T07:00:00Z');
  await refreshActionsSpend(db, () => Promise.resolve({ code: 0, stdout: JSON.stringify({ usageItems: [{ product: 'actions', netAmount: 0.1 }, { product: 'actions', netAmount: 0.2 }] }), stderr: '' }), lastDay);

  expect(loadCostGoal(db, { op: '<=', value: 0.3 }, lastDay)).toStrictEqual({ text: 'Actions $0.30 of $0.30 budget to date', verdict: 'green' });
});
