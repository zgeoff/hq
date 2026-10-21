import { expect, test } from 'bun:test';
import { buildStubLinearIssuePages } from './build-stub-linear-issue-pages.ts';
import { LINEAR_GRAPHQL_URL, linearWorkflowStates } from './linear-handlers.ts';
import { server } from './node.ts';

test('it answers the issues page queries with the scripted answers in order', async () => {
  server.use(buildStubLinearIssuePages([{ issues: { nodes: ['first pot'] } }, { issues: { nodes: ['second pot'] } }]));

  const first = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Pots', variables: { after: null, filter: { team: 'KET' } } }) });
  const second = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Pots', variables: { after: 'c1', filter: { team: 'KET' } } }) });
  const answers: unknown[] = [await first.json(), await second.json()];

  expect(answers).toStrictEqual([{ data: { issues: { nodes: ['first pot'] } } }, { data: { issues: { nodes: ['second pot'] } } }]);
});

test('it answers 500 to an issues page query past the last scripted answer', async () => {
  server.use(buildStubLinearIssuePages([{ issues: { nodes: [] } }]));
  await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Pots', variables: { after: null, filter: { team: 'KET' } } }) });

  const past = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Pots', variables: { after: 'c1', filter: { team: 'KET' } } }) });
  const answer: unknown = await past.json();

  expect(past.status).toBe(500);
  expect(answer).toStrictEqual({ errors: [{ message: 'the issues page stub holds 1 answers and was asked for one more' }] });
});

test('it lets every other query fall through to the Linear handlers, body intact', async () => {
  server.use(buildStubLinearIssuePages([]));
  linearWorkflowStates.push({ team: 'KET', name: 'Steeping' });

  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query States', variables: { teamKey: 'KET' } }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ data: { workflowStates: { nodes: [{ name: 'Steeping' }] } } });
});
