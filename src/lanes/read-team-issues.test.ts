import { expect, test } from 'bun:test';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import { readTeamIssues } from './read-team-issues.ts';

test('it reads the type, priority, age and project labels of each issue', async () => {
  const call = makePagedCall(buildReadyPage([{ identifier: 'GEO-9801', project: 'kettle maintenance', projectLabels: ['maintenance'], labels: ['kettle'], type: 'Bug', priority: 2, createdAt: '2026-10-03T00:00:00.000Z' }], null));

  const issues = await readTeamIssues(call, 'GEO', 'Backlog');

  expect(issues).toStrictEqual([
    { identifier: 'GEO-9801', project: 'kettle maintenance', projectLabels: ['maintenance'], labels: ['kettle', 'Bug'], type: 'Bug', priority: 2, createdAt: '2026-10-03T00:00:00.000Z', parent: null },
  ]);
});

test('it names the state it read when an answer has the wrong shape', async () => {
  const call = makePagedCall({ issues: { nodes: [{ identifier: 'GEO-9802' }], pageInfo: { hasNextPage: false, endCursor: null } } });

  await expect(readTeamIssues(call, 'GEO', 'Backlog')).rejects.toThrow("Linear's Backlog answer has an unexpected shape: issues.nodes.0.priority");
});
