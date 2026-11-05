import { expect, test } from 'bun:test';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import { readTeamIssues } from './read-team-issues.ts';

test('it reads the type, priority, age and project labels of each issue', async () => {
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-9801', project: 'kettle maintenance', projectLabels: ['maintenance'], labels: ['kettle'], type: 'Bug', priority: 2, createdAt: '2026-10-03T00:00:00.000Z' }], null));

  const issues = await readTeamIssues(call, 'GEO', 'Backlog');

  expect(issues).toStrictEqual([
    { issue: { identifier: 'GEO-9801', project: 'kettle maintenance', projectLabels: ['maintenance'], labels: ['kettle', 'Bug'], type: 'Bug', priority: 2, createdAt: '2026-10-03T00:00:00.000Z', parent: null }, openBlockers: [], moreRelations: false },
  ]);
});

test('it names the state it read when an answer has the wrong shape', async () => {
  const call = makePagedCall({ issues: { nodes: [{ identifier: 'GEO-9802' }], pageInfo: { hasNextPage: false, endCursor: null } } });

  await expect(readTeamIssues(call, 'GEO', 'Backlog')).rejects.toThrow("Linear's Backlog answer has an unexpected shape: issues.nodes.0.priority");
});

test('it lists a blocker that is not completed and leaves out a completed one', async () => {
  const blockers = [{ identifier: 'GEO-9811', stateType: 'started' }, { identifier: 'GEO-9812', stateType: 'completed' }, { identifier: 'GEO-9813', stateType: 'canceled' }];
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-9810', blockers }], null));

  const issues = await readTeamIssues(call, 'GEO', 'Ready');

  expect(issues).toStrictEqual([
    { issue: { identifier: 'GEO-9810', project: null, projectLabels: [], labels: [], type: 'none', priority: 0, createdAt: '2026-10-01T00:00:00.000Z', parent: null }, openBlockers: ['GEO-9811', 'GEO-9813'], moreRelations: false },
  ]);
});

test('it says an issue has more relations than the page read', async () => {
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-9820', moreRelations: true }], null));

  const issues = await readTeamIssues(call, 'GEO', 'Ready');

  expect(issues).toStrictEqual([
    { issue: { identifier: 'GEO-9820', project: null, projectLabels: [], labels: [], type: 'none', priority: 0, createdAt: '2026-10-01T00:00:00.000Z', parent: null }, openBlockers: [], moreRelations: true },
  ]);
});
