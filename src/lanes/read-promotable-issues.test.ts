import { expect, test } from 'bun:test';
import type { LinearCall } from '../linear/types.ts';
import { readPromotableIssues } from './read-promotable-issues.ts';

interface IssueSeed {
  identifier: string;
  title: string;
  description: string;
  labels?: string[];
  blockerStates?: string[];
}

// A fake Linear that answers the Backlog query with one page of the given issues and records the
// variables, and a description with every section filled.
function setupTest() {
  const variables: Record<string, unknown>[] = [];
  const filled =
    '## Outcome\n\nThe kettle boils.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the element.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  const answerWith = (seeds: IssueSeed[]): LinearCall => {
    const nodes = seeds.map((seed) => ({
      identifier: seed.identifier,
      title: seed.title,
      description: seed.description,
      labels: { nodes: (seed.labels ?? []).map((name) => ({ name })) },
      inverseRelations: {
        nodes: (seed.blockerStates ?? []).map((type, index) => ({ type: 'blocks', issue: { identifier: `GEO-97${index}`, state: { type } } })),
        pageInfo: { hasNextPage: false },
      },
    }));
    return (_query, vars) => {
      variables.push(vars);
      return Promise.resolve({ issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
    };
  };
  return { filled, variables, answerWith };
}

test('it lists a complete Backlog issue whose blockers are Done', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9801', title: 'boil the kettle', description: app.filled, blockerStates: ['completed'] }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect([issues, app.variables]).toStrictEqual([[{ identifier: 'GEO-9801', title: 'boil the kettle' }], [{ after: null, team: 'GEO', state: 'Backlog' }]]);
});

test('it leaves out an issue with a blocker in Todo', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9802', title: 'pour the tea', description: app.filled, blockerStates: ['completed', 'unstarted'] }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([]);
});

test('it leaves out a parked issue', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9803', title: 'polish the widgets', description: app.filled, labels: ['Feature', 'parked'] }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([]);
});

test('it leaves out an issue with no Acceptance section', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9804', title: 'stack the widgets', description: app.filled.replace(/## Acceptance[\s\S]*?(?=## Actions)/u, '') }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([]);
});

test('it leaves out an issue whose Acceptance holds only a placeholder', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9805', title: 'count the widgets', description: app.filled.replace('- [ ] The kettle boils in a test (unit test)', '- [ ] TBD') }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([]);
});

test('it takes Questions to settle in place of Scope', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9806', title: 'design the kettle', description: app.filled.replace('## Scope\n\nIn: the element.\nOut: none stated.', '## Questions to settle\n\n- Which spout?') }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([{ identifier: 'GEO-9806', title: 'design the kettle' }]);
});

test('it leaves out an issue whose Scope keeps the empty In and Out fields of the template', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9807', title: 'scope the kettle', description: app.filled.replace('In: the element.\nOut: none stated.', 'In:\nOut:') }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([]);
});

test('it takes In and Out fields whose items sit on the lines below them', async () => {
  const app = setupTest();
  const call = app.answerWith([{ identifier: 'GEO-9808', title: 'list the widgets', description: app.filled.replace('In: the element.\nOut: none stated.', 'In:\n- the element\nOut:\n- the lid') }]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect(issues).toStrictEqual([{ identifier: 'GEO-9808', title: 'list the widgets' }]);
});
