import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { syncFiled } from './sync-filed.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it stores the PR attachment that opened before the issue, and skips one that opened after or has no open time', async () => {
  const ctx = setupTest();
  const read = await syncFiled(ctx.db, () => Promise.resolve({
    issues: {
      nodes: [
        {
          identifier: 'GEO-9871',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/41', metadata: { createdAt: '2026-10-21T09:00:00.000Z', status: 'merged' } }] },
        },
        {
          identifier: 'GEO-9872',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/42', metadata: { createdAt: '2026-10-21T13:00:00.000Z', status: 'open' } }] },
        },
        {
          identifier: 'GEO-9873',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/43', metadata: null }] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }), new Date('2026-10-21T00:00:00Z'), { to: new Date('2026-10-22T00:00:00Z') });

  expect(read).toBe(3);
  expect(ctx.db.query('SELECT issue, pr_ref FROM linear_filed ORDER BY issue').all()).toStrictEqual([
    { issue: 'GEO-9871', pr_ref: 'kettle#41' },
    { issue: 'GEO-9872', pr_ref: null },
    { issue: 'GEO-9873', pr_ref: null },
  ]);
});
