import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { listUmbrellaBoxes } from '../linear/umbrella-boxes.ts';
import { decideUmbrellaBox } from '../linear/umbrella-boxes.ts';
import type { Runner } from '../runner/types.ts';
import { syncDay } from './sync-day.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    ghReturning: (rows: { repo: string; number: number; body: string }[]): Runner => {
      return () => Promise.resolve({ code: 0, stderr: '', stdout: JSON.stringify(rows.map((row) => ({ number: row.number, title: 'feat: an invented widget', body: row.body, closedAt: '2026-10-14T05:00:00Z', repository: { name: row.repo } }))) });
    },
  };
}

test('it records each issue a merged PR contributes to and ignores Fixes and Related to', async () => {
  const ctx = setupTest();
  const run = ctx.ghReturning([
    { repo: 'tools', number: 7, body: 'Contributes to GEO-9001\n\nAlso Contributes to GEO-9002 and again Contributes to GEO-9001.' },
    { repo: 'tools', number: 8, body: 'Fixes GEO-9003\nRelated to GEO-9004' },
    { repo: 'tools', number: 9, body: 'Fixes GEO-9005, Contributes to GEO-9006' },
  ]);

  await syncDay(ctx.db, run, '2026-10-14');

  expect(listUmbrellaBoxes(ctx.db).map((box) => [box.repo, box.number, box.issue, box.merged_at, box.outcome])).toStrictEqual([
    ['tools', 7, 'GEO-9001', '2026-10-14T05:00:00Z', null],
    ['tools', 7, 'GEO-9002', '2026-10-14T05:00:00Z', null],
    ['tools', 9, 'GEO-9006', '2026-10-14T05:00:00Z', null],
  ]);
});

test('it keeps a decided outcome when the same day is synced again', async () => {
  const ctx = setupTest();
  const run = ctx.ghReturning([{ repo: 'tools', number: 7, body: 'Contributes to GEO-9001' }]);
  await syncDay(ctx.db, run, '2026-10-14');
  const [box] = listUmbrellaBoxes(ctx.db);
  decideUmbrellaBox(ctx.db, box!, 'ticked');

  await syncDay(ctx.db, run, '2026-10-14');

  expect(listUmbrellaBoxes(ctx.db).map((row) => row.outcome)).toStrictEqual(['ticked']);
});
