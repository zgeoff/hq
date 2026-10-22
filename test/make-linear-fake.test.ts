import { expect, test } from 'bun:test';
import type { ProjectIssue, ReportIssue } from '../src/shipped/types.ts';
import { makeLinearFake } from './make-linear-fake.ts';

const KETTLE: ReportIssue = { id: 'GEO-9601', title: 'Descale the kettle', url: 'https://linear.example/issue/GEO-9601', status: 'Done', statusType: 'completed', project: 'Kettle', priority: { value: 2, name: 'High' } as unknown as number, labels: ['Chore'] },
  PROJECT: ProjectIssue[] = [
    { id: 'GEO-9601', statusType: 'completed', project: 'Kettle' },
    { id: 'GEO-9603', statusType: 'triage', project: 'Kettle' },
    { id: 'GEO-9604', statusType: 'started', project: 'Teapot' },
  ],
  TEAPOT: ReportIssue = { id: 'GEO-9602', title: 'Hinge the teapot lid', url: 'https://linear.example/issue/GEO-9602', status: 'Todo', statusType: 'unstarted', project: null, priority: 0, labels: [] };

test('an id query answers each named issue once, in Linear\'s node shape, and leaves an unknown id out', async () => {
  const asked: unknown[] = [],
    call = makeLinearFake([KETTLE, TEAPOT, KETTLE], PROJECT, asked),
    reply = await call('query', { ids: ['GEO-9601', 'GEO-9699', 'GEO-9602'] });
  expect(reply).toStrictEqual({
    issues: {
      nodes: [
        { identifier: 'GEO-9601', title: 'Descale the kettle', url: 'https://linear.example/issue/GEO-9601', priority: 2, state: { name: 'Done', type: 'completed' }, project: { name: 'Kettle' }, labels: { nodes: [{ name: 'Chore' }] } },
        { identifier: 'GEO-9602', title: 'Hinge the teapot lid', url: 'https://linear.example/issue/GEO-9602', priority: 0, state: { name: 'Todo', type: 'unstarted' }, project: null, labels: { nodes: [] } },
      ],
    },
  });
  expect(asked).toStrictEqual([{ ids: ['GEO-9601', 'GEO-9699', 'GEO-9602'] }]);
});

test('a project query answers that project\'s issues in one page', async () => {
  const answer = await makeLinearFake([], PROJECT)('query', { after: null, name: 'Kettle' });
  expect(answer).toStrictEqual({
    issues: {
      nodes: [
        { identifier: 'GEO-9601', state: { type: 'completed' }, project: { name: 'Kettle' } },
        { identifier: 'GEO-9603', state: { type: 'triage' }, project: { name: 'Kettle' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
});
