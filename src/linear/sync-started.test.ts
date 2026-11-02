import { expect, onTestFinished, test } from 'bun:test';
import { makeThroughputLinearCall } from '../../test/make-throughput-linear-call.ts';
import { freshDb } from '../../test/helpers.ts';
import { syncStarted } from './sync-started.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readPrs: () => fresh.db.query('SELECT issue, ref, status, merged_at FROM linear_started_prs ORDER BY issue, ref').all() };
}

const attachment = (number: number, status: string, mergedAt: string | null) => ({ url: `https://github.com/zgeoff/kettle/pull/${number}`, sourceType: 'github', metadata: { status, mergedAt, number, repoName: 'kettle', repoLogin: 'zgeoff' } });

test('it stores each In Progress issue with its PR attachments and replaces them on the next read', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-16T07:00:00Z');
  const first = makeThroughputLinearCall([], [
    { identifier: 'GEO-9801', startedAt: '2026-10-14T07:00:00Z', attachments: [attachment(41, 'merged', '2026-10-15T01:00:00Z'), attachment(42, 'open', null), { url: 'https://example.com', sourceType: 'slack', metadata: {} }] },
    { identifier: 'GEO-9802', startedAt: '2026-10-14T08:00:00Z' },
  ]);
  await syncStarted(ctx.db, first, at);
  const stored = ctx.readPrs();

  await syncStarted(ctx.db, makeThroughputLinearCall([], [{ identifier: 'GEO-9802', startedAt: '2026-10-14T08:00:00Z', attachments: [attachment(43, 'closed', null)] }]), at);

  expect({ stored, replaced: ctx.readPrs() }).toStrictEqual({
    stored: [
      { issue: 'GEO-9801', ref: 'kettle#41', status: 'merged', merged_at: '2026-10-15T01:00:00Z' },
      { issue: 'GEO-9801', ref: 'kettle#42', status: 'open', merged_at: null },
    ],
    replaced: [{ issue: 'GEO-9802', ref: 'kettle#43', status: 'closed', merged_at: null }],
  });
});
