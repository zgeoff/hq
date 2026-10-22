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
// variables.
function setupTest() {
  const variables: Record<string, unknown>[] = [];
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
  return { variables, answerWith };
}

test('it lists the complete Backlog issue whose blockers are Done and leaves out the one with a blocker in Todo', async () => {
  const app = setupTest();
  const description =
    '## Outcome\n\nThe kettle boils.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the element.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle boils in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  const call = app.answerWith([
    { identifier: 'GEO-9801', title: 'boil the kettle', description, blockerStates: ['completed'] },
    { identifier: 'GEO-9802', title: 'pour the tea', description, blockerStates: ['completed', 'unstarted'] },
  ]);

  const issues = await readPromotableIssues(call, 'GEO');

  expect([issues, app.variables]).toStrictEqual([[{ identifier: 'GEO-9801', title: 'boil the kettle' }], [{ after: null, team: 'GEO', state: 'Backlog' }]]);
});
