import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { loadActionsSpend } from './load-actions-spend.ts';
import { refreshActionsSpend } from './refresh-actions-spend.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

function makeGh(result: RunResult, calls: string[][] = []): Runner {
  return (cmd) => {
    calls.push(cmd);
    return Promise.resolve(result);
  };
}

function buildUsage(items: unknown[]): RunResult {
  return { code: 0, stdout: JSON.stringify({ usageItems: items }), stderr: '' };
}

const OCT_16 = new Date('2026-10-16T07:00:00Z');

test('it reads the month of the UTC date from the user billing usage endpoint', async () => {
  const calls: string[][] = [],
    db = setupTest();

  await refreshActionsSpend(db, makeGh(buildUsage([]), calls), OCT_16);

  expect(calls).toStrictEqual([['gh', 'api', 'users/zgeoff/settings/billing/usage?year=2026&month=10']]);
});

test('it sums the net amount of the actions product only, in any case', async () => {
  const db = setupTest(),
    failure = await refreshActionsSpend(db, makeGh(buildUsage([
      { date: '2026-10-02T00:00:00Z', product: 'actions', sku: 'actions_linux', quantity: 300, unitType: 'Minutes', pricePerUnit: 0.008, grossAmount: 2.4, discountAmount: 0.4, netAmount: 2, repositoryName: 'zgeoff/kettle' },
      { date: '2026-10-03T00:00:00Z', product: 'Actions', sku: 'actions_storage', quantity: 1, unitType: 'GigabyteHours', pricePerUnit: 0.25, grossAmount: 0.5, discountAmount: 0, netAmount: 0.5, repositoryName: 'zgeoff/teapot' },
      { date: '2026-10-03T00:00:00Z', product: 'packages', sku: 'packages_storage', quantity: 2, unitType: 'GigabyteHours', pricePerUnit: 0.25, grossAmount: 9, discountAmount: 0, netAmount: 9, repositoryName: 'zgeoff/kettle' },
      { date: '2026-10-04T00:00:00Z', product: 'copilot', sku: 'copilot_premium_request', quantity: 10, unitType: 'Requests', pricePerUnit: 0.04, grossAmount: 7, discountAmount: 0, netAmount: 7, repositoryName: '' },
    ])), OCT_16);

  expect(failure).toBeNull();
  expect(loadActionsSpend(db, OCT_16)).toBe(2.5);
});

test('it reads an empty usage list as no spend', async () => {
  const db = setupTest();

  await refreshActionsSpend(db, makeGh(buildUsage([])), OCT_16);

  expect(loadActionsSpend(db, OCT_16)).toBe(0);
});

test('it leaves the spend unknown when gh exits non-zero, even after a good reading', async () => {
  const db = setupTest(),
    earlier = await refreshActionsSpend(db, makeGh(buildUsage([{ product: 'actions', netAmount: 4 }])), new Date('2026-10-16T06:30:00Z')),
    failure = await refreshActionsSpend(db, makeGh({ code: 1, stdout: '', stderr: 'gh: Resource not accessible by personal access token (HTTP 403)' }), OCT_16);

  expect(earlier).toBeNull();
  expect(failure).toBe('GitHub billing usage failed (1): gh: Resource not accessible by personal access token (HTTP 403)');
  expect(loadActionsSpend(db, OCT_16)).toBeNull();
});

test('it leaves the spend unknown when the JSON has no usageItems', async () => {
  const db = setupTest(),
    failure = await refreshActionsSpend(db, makeGh({ code: 0, stdout: JSON.stringify({ total: 4 }), stderr: '' }), OCT_16);

  expect(failure).toBe('GitHub billing usage: no usageItems list');
  expect(loadActionsSpend(db, OCT_16)).toBeNull();
});

test('it leaves the spend unknown when gh prints no JSON', async () => {
  const db = setupTest(),
    failure = await refreshActionsSpend(db, makeGh({ code: 0, stdout: 'not json', stderr: '' }), OCT_16);

  expect(failure).toBe('GitHub billing usage returned no JSON');
  expect(loadActionsSpend(db, OCT_16)).toBeNull();
});

test('it leaves the spend unknown when an item has no numeric netAmount', async () => {
  const db = setupTest(),
    failure = await refreshActionsSpend(db, makeGh(buildUsage([{ product: 'actions', netAmount: 1 }, { product: 'actions', grossAmount: 3, netAmount: '3' }])), OCT_16);

  expect(failure).toBe('GitHub billing usage: an item without a product or a netAmount');
  expect(loadActionsSpend(db, OCT_16)).toBeNull();
});

test('it treats a reading from the previous UTC month as unknown', async () => {
  const db = setupTest();
  await refreshActionsSpend(db, makeGh(buildUsage([{ product: 'actions', netAmount: 40 }])), new Date('2026-09-30T23:30:00Z'));

  expect(loadActionsSpend(db, new Date('2026-10-01T00:10:00Z'))).toBeNull();
});

test('it treats a reading over two hours old as unknown', async () => {
  const db = setupTest();
  await refreshActionsSpend(db, makeGh(buildUsage([{ product: 'actions', netAmount: 4 }])), new Date('2026-10-16T04:59:00Z'));

  expect(loadActionsSpend(db, OCT_16)).toBeNull();
});

test('it treats a stored reading that fails the schema as unknown', () => {
  const db = setupTest();
  setMeta(db, 'actions_spend', JSON.stringify({ at: 'Fri, 16 Oct 2026 06:30:00 GMT', month: '2026-10', net: 4 }));

  expect(loadActionsSpend(db, OCT_16)).toBeNull();
});
