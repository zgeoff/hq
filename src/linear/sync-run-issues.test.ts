import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { addRun } from '../runs/add-run.ts';
import { setState } from '../runs/set-state.ts';
import { syncRunIssues } from './sync-run-issues.ts';
import { writeIssues } from './write-issues.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    addKettleRun: (issue: string) => {
      addRun(fresh.db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
    },
  };
}

test('it stores the Linear state of each open run\'s issue, and asks only about open runs', async () => {
  const ctx = setupTest();
  const asked: unknown[] = [];
  ctx.addKettleRun('GEO-9861');
  ctx.addKettleRun('GEO-9862');
  ctx.addKettleRun('GEO-9863');
  setState(ctx.db, 'GEO-9863', 'done', {}, 'kettle-bot');

  const read = await syncRunIssues(ctx.db, (_query, variables) => {
    asked.push(variables['ids']);
    return Promise.resolve({
      issues: {
        nodes: [
          { identifier: 'GEO-9861', title: 'Invented kettle work', completedAt: '2026-10-21T01:02:03.456Z', canceledAt: null, labels: { nodes: [] } },
          { identifier: 'GEO-9862', title: 'Invented kettle work', completedAt: null, canceledAt: null, labels: { nodes: [] } },
        ],
      },
    });
  });

  expect(read).toBe(2);
  expect(asked).toStrictEqual([['GEO-9861', 'GEO-9862']]);
  expect(ctx.db.query('SELECT issue, state, closed_at FROM linear_issues ORDER BY issue').all()).toStrictEqual([
    { issue: 'GEO-9861', state: 'completed', closed_at: '2026-10-21T01:02:03Z' },
    { issue: 'GEO-9862', state: 'open', closed_at: null },
  ]);
});

test('it keeps the stored row of an issue Linear did not return, and asks 50 issues to a query', async () => {
  const ctx = setupTest();
  const asked: number[] = [];
  for (let index = 0; index < 51; index += 1) {
    ctx.addKettleRun(`GEO-${9900 + index}`);
  }
  writeIssues(ctx.db, [{ issue: 'GEO-9900', type: 'none', title: 'Invented kettle work', state: 'canceled', closed_at: '2026-10-20T00:00:00Z' }]);

  const read = await syncRunIssues(ctx.db, (_query, variables) => {
    asked.push(z.array(z.string()).parse(variables['ids']).length);
    return Promise.resolve({ issues: { nodes: [] } });
  });

  expect(read).toBe(0);
  expect(asked).toStrictEqual([50, 1]);
  expect(ctx.db.query("SELECT state FROM linear_issues WHERE issue = 'GEO-9900'").get()).toStrictEqual({ state: 'canceled' });
});

test('it asks Linear only about run keys that are Linear identifiers', async () => {
  const ctx = setupTest();
  const asked: unknown[] = [];
  ctx.addKettleRun('GEO-9864');
  ctx.addKettleRun('GEO-9864-kettle');

  await syncRunIssues(ctx.db, (_query, variables) => {
    asked.push(variables['ids']);
    return Promise.resolve({ issues: { nodes: [] } });
  });

  expect(asked).toStrictEqual([['GEO-9864']]);
});
