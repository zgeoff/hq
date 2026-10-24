import { expect, mock, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { LINEAR_GRAPHQL_URL } from '../../mocks/linear-handlers.ts';
import { server } from '../../mocks/node.ts';
import { freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { resetKey } from '../linear/reset-key.ts';
import type { LinearCall } from '../linear/types.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { readPromotableIssues } from './read-promotable-issues.ts';

interface IssueSeed {
  identifier: string;
  title: string;
  description: string;
  labels?: string[];
  typeLabel?: string;
  project?: string;
  priority?: number;
  blockerStates?: string[];
}

// A fake Linear that answers the Backlog query with the given pages of issues, one per call in
// order, each but the last naming a cursor for the next, and records the variables.
function setupTest() {
  const variables: Record<string, unknown>[] = [];
  const answerWith = (...pages: IssueSeed[][]): LinearCall => {
    const answers = pages.map((seeds, index) => {
      const nodes = seeds.map((seed) => ({
        identifier: seed.identifier,
        title: seed.title,
        description: seed.description,
        priority: seed.priority ?? 0,
        createdAt: '2026-10-01T00:00:00Z',
        project: seed.project === undefined ? null : { name: seed.project, labels: { nodes: [{ name: 'maintenance' }] } },
        parent: null,
        labels: { nodes: [...(seed.labels ?? []).map((name) => ({ name })), ...(seed.typeLabel === undefined ? [] : [{ name: seed.typeLabel, parent: { name: 'Type' } }])] },
        inverseRelations: {
          nodes: (seed.blockerStates ?? []).map((type, blocker) => ({ type: 'blocks', issue: { identifier: `GEO-97${blocker}`, state: { type } } })),
          pageInfo: { hasNextPage: false },
        },
      }));
      const last = index === pages.length - 1;
      return { issues: { nodes, pageInfo: { hasNextPage: !last, endCursor: last ? null : `kettle-page-${index + 2}` } } };
    });
    return (_query, vars) => {
      variables.push(vars);
      return Promise.resolve(answers[variables.length - 1]);
    };
  };
  return { variables, answerWith };
}

test('it lists the complete Backlog issue whose blockers are Done and leaves out the one with a blocker in Todo', async () => {
  const app = setupTest();
  const description =
    '## Outcome\n\nThe kettle boils.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the element.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  const call = app.answerWith([
    { identifier: 'GEO-9801', title: 'boil the kettle', description, blockerStates: ['completed'], labels: ['atc'], typeLabel: 'Bug', project: 'kitchen', priority: 2 },
    { identifier: 'GEO-9802', title: 'pour the tea', description, blockerStates: ['completed', 'unstarted'] },
  ]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect([issues, app.variables]).toStrictEqual([
      [
        {
          identifier: 'GEO-9801',
          title: 'boil the kettle',
          facts: { identifier: 'GEO-9801', project: 'kitchen', projectLabels: ['maintenance'], labels: ['atc', 'Bug'], type: 'Bug', priority: 2, createdAt: '2026-10-01T00:00:00Z', parent: null },
        },
      ],
      [{ after: null, team: 'GEO', state: 'Backlog' }]]);
});

test('it rejects a Backlog answer with an unexpected shape', async () => {
  const answer = { issues: { nodes: [{ identifier: 'GEO-9809' }], pageInfo: { hasNextPage: false, endCursor: null } } };
  const call: LinearCall = () => Promise.resolve(answer);

  const read = readPromotableIssues(call, 'GEO');

  await expect(read).rejects.toMatchObject({ code: 'linear_failed', message: "Linear's Backlog answer has an unexpected shape: issues.nodes.0.title" });
});

test('it stops after twenty Backlog pages that each name another page', async () => {
  const cursors: unknown[] = [];
  const call: LinearCall = (_query, vars) => {
    cursors.push(vars['after']);
    return Promise.resolve({ issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `widget-${cursors.length}` } } });
  };

  const read = readPromotableIssues(call, 'GEO');

  await expect(read).rejects.toMatchObject({ code: 'linear_failed', message: 'more than 1000 Backlog issues; hq reads no further' });
  expect(cursors).toHaveLength(20);
});

test('it collects the promotable issues from every Backlog page, asking for each next page by its cursor', async () => {
  const app = setupTest();
  const description =
    '## Outcome\n\nThe widgets ship.\n\n## Context\n\n- Project: workshop\n\n## Scope\n\nIn: the crate.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The widgets ship in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  const call = app.answerWith(
    [{ identifier: 'GEO-9810', title: 'crate the widgets', description }],
    [
      { identifier: 'GEO-9811', title: 'label the crates', description, labels: ['parked'] },
      { identifier: 'GEO-9812', title: 'load the van', description },
    ],
  );

  const issues = await readPromotableIssues(call, 'GEO');

  expect([issues, app.variables]).toStrictEqual([
    [
      expect.objectContaining({ identifier: 'GEO-9810', title: 'crate the widgets' }),
      expect.objectContaining({ identifier: 'GEO-9812', title: 'load the van' }),
    ],
    [
      { after: null, team: 'GEO', state: 'Backlog' },
      { after: 'kettle-page-2', team: 'GEO', state: 'Backlog' },
    ],
  ]);
});

test('hq lanes promotable --json prints the promotable Backlog issues of the lanes team', async () => {
  const fresh = freshDb();
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  const log = console.log;
  const printed: string[] = [];
  const asked: unknown[] = [];
  onTestFinished(fresh.cleanup);
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  const description =
    '## Outcome\n\nThe kettle whistles.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the whistle.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle whistles in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  const relations = { nodes: [], pageInfo: { hasNextPage: false } };
  const nodes = [
    { identifier: 'GEO-9813', title: 'fit the whistle', description, priority: 0, createdAt: '2026-10-01T00:00:00Z', project: null, parent: null, labels: { nodes: [] }, inverseRelations: relations },
    { identifier: 'GEO-9814', title: 'paint the whistle', description, priority: 0, createdAt: '2026-10-01T00:00:00Z', project: null, parent: null, labels: { nodes: [{ name: 'parked' }] }, inverseRelations: relations },
  ];
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const body: unknown = await info.request.json();
      asked.push(body);
      return HttpResponse.json({ data: { issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } });
    }),
  );

  const code = await main(['lanes', 'promotable', '--json'], run);

  expect([code, JSON.parse(printed.join('')), asked]).toStrictEqual([
    0,
    { ok: true, issues: [{ identifier: 'GEO-9813', title: 'fit the whistle' }] },
    [{ query: expect.stringContaining('issues(first: 50,'), variables: { after: null, team: 'GEO', state: 'Backlog' } }],
  ]);
});
