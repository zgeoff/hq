import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import type { LinearCall } from '../linear/types.ts';
import { loadProjectIssues } from './load-project-issues.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

// Linear with the Kettle project's issues over two pages, the second behind the cursor `page-2`.
function buildTwoPageLinear(asked: unknown[]): LinearCall {
  return (_query, variables) => {
    asked.push(variables);
    const onSecond = variables['after'] === 'page-2',
      page = [{ identifier: onSecond ? 'GEO-9702' : 'GEO-9701', state: { type: onSecond ? 'triage' : 'completed' }, project: { name: 'Kettle' } }];
    return Promise.resolve({ issues: { nodes: page, pageInfo: { hasNextPage: !onSecond, endCursor: onSecond ? null : 'page-2' } } });
  };
}

test('a project over two pages gives both pages\' issues, the second read behind the first page\'s cursor', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    issues = await loadProjectIssues(buildTwoPageLinear(asked), ctx.db, ['Kettle'], new Date('2026-10-15T02:00:00Z'));
  expect(issues).toStrictEqual([
    { id: 'GEO-9701', statusType: 'completed', project: 'Kettle' },
    { id: 'GEO-9702', statusType: 'triage', project: 'Kettle' },
  ]);
  expect(asked).toStrictEqual([
    { after: null, name: 'Kettle' },
    { after: 'page-2', name: 'Kettle' },
  ]);
});

test('a project\'s issues are kept 5 minutes, then read again', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = buildTwoPageLinear(asked),
    first = await loadProjectIssues(fakeLinear, ctx.db, ['Kettle'], new Date('2026-10-15T02:00:00Z')),
    second = await loadProjectIssues(fakeLinear, ctx.db, ['Kettle'], new Date('2026-10-15T02:04:00Z'));

  expect([first.length, second.length, asked.length]).toStrictEqual([2, 2, 2]);
});

test('a project\'s issues are read again once 5 minutes have passed', async () => {
  const asked: unknown[] = [],
    ctx = setupTest(),
    fakeLinear = buildTwoPageLinear(asked),
    first = await loadProjectIssues(fakeLinear, ctx.db, ['Kettle'], new Date('2026-10-15T02:00:00Z')),
    second = await loadProjectIssues(fakeLinear, ctx.db, ['Kettle'], new Date('2026-10-15T02:06:00Z'));

  expect([first.length, second.length, asked.length]).toStrictEqual([2, 2, 4]);
});

test('a project\'s kept issues in another shape are read again, and Linear\'s answer replaces them', async () => {
  const asked: unknown[] = [],
    ctx = setupTest();
  ctx.db
    .query("INSERT INTO shipped_cache (kind, key, body, fetched_at, expires_at) VALUES ('project', 'Kettle', ?, '2026-10-15T02:00:00Z', '2026-10-15T02:05:00Z')")
    .run(JSON.stringify([{ id: 'GEO-9701', statusType: 3, project: 'Kettle' }]));

  await expect(loadProjectIssues(buildTwoPageLinear(asked), ctx.db, ['Kettle'], new Date('2026-10-15T02:01:00Z'))).resolves.toStrictEqual([
    { id: 'GEO-9701', statusType: 'completed', project: 'Kettle' },
    { id: 'GEO-9702', statusType: 'triage', project: 'Kettle' },
  ]);
  expect(asked).toHaveLength(2);
  expect(ctx.db.query("SELECT body FROM shipped_cache WHERE kind = 'project'").all()).toStrictEqual([
    {
      body: JSON.stringify([
        { id: 'GEO-9701', statusType: 'completed', project: 'Kettle' },
        { id: 'GEO-9702', statusType: 'triage', project: 'Kettle' },
      ]),
    },
  ]);
});
