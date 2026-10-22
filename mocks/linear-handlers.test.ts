import { expect, test } from 'bun:test';
import { z } from 'zod';
import { LINEAR_GRAPHQL_URL, linearDocuments, linearIssues } from './linear-handlers.ts';

test('it answers the Ready query with the issues in its team and state only', async () => {
  linearIssues.push(
    { identifier: 'GEO-1', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: 'atc roadmap', labels: ['process'], parent: 'GEO-9' },
    { identifier: 'GEO-2', team: 'GEO', state: 'Todo', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'KET-1', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
  );

  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Ready', variables: { after: null, team: 'GEO', state: 'Ready' } }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({
    data: {
      issues: {
        nodes: [{ identifier: 'GEO-1', priority: 0, createdAt: '2026-10-01T00:00:00.000Z', project: { name: 'atc roadmap', labels: { nodes: [] } }, labels: { nodes: [{ name: 'process', parent: null }] }, parent: { identifier: 'GEO-9' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  });
});

test('it answers the issues query with the issues whose identifier, or a previous one, it asks for', async () => {
  linearIssues.push(
    { identifier: 'KET-1', team: 'KET', state: 'Done', stateType: 'completed', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'TEA-3', team: 'TEA', state: 'Canceled', stateType: 'canceled', previousIdentifiers: ['KET-2'], project: null, labels: [], parent: null },
    { identifier: 'KET-4', team: 'KET', state: 'Todo', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
  );

  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Issues', variables: { ids: ['KET-1', 'KET-2', 'KET-9'] } }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({
    data: {
      issues: {
        nodes: [
          { identifier: 'KET-1', previousIdentifiers: [], state: { type: 'completed' }, title: 'Invented issue', completedAt: null, canceledAt: null, labels: { nodes: [] } },
          { identifier: 'TEA-3', previousIdentifiers: ['KET-2'], state: { type: 'canceled' }, title: 'Invented issue', completedAt: null, canceledAt: null, labels: { nodes: [] } },
        ],
      },
    },
  });
});

test('it answers the documents query with the documents of that slug ID', async () => {
  linearDocuments.push({ id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', slugID: 'abc123def456', content: 'Status: decided' }, { id: '0b7e2c11-4f3a-4d2e-8b6c-9a1d3e5f7a20', slugID: 'fff000fff000', content: 'Status: proposed' });

  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Documents', variables: { slugID: 'abc123def456' } }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ data: { documents: { nodes: [{ content: 'Status: decided' }] } } });
});

test('it answers the document query with the document of that id', async () => {
  linearDocuments.push({ id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', slugID: 'abc123def456', content: 'Status: decided' });

  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Document', variables: { id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10' } }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ data: { document: { content: 'Status: decided' } } });
});

test('it answers the document query for an unknown id with an error', async () => {
  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query Document', variables: { id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10' } }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ data: null, errors: [{ message: 'Entity not found: Document' }] });
});

test('it answers any other query as the key user', async () => {
  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query { viewer { id } }', variables: {} }) });
  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ data: { viewer: { id: 'kettle-bot' } } });
});

test('it answers an issues page query with as many issues as its first asks for, and a cursor to the rest', async () => {
  linearIssues.push(
    { identifier: 'KET-1', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'KET-2', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'KET-3', team: 'KET', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
  );
  const filter = { team: { key: { eq: 'KET' } }, state: { name: { in: ['Ready'] } } };
  const nodeSchema = z.object({ identifier: z.string() });
  const issuesSchema = z.object({ nodes: z.array(nodeSchema), pageInfo: z.unknown() });
  const answerSchema = z.object({ data: z.object({ issues: issuesSchema }) });

  const response = await fetch(LINEAR_GRAPHQL_URL, { method: 'POST', body: JSON.stringify({ query: 'query { issues(first: 2, after: $after, filter: $filter) { nodes { identifier } } }', variables: { after: null, filter } }) });
  const sent: unknown = await response.json();
  const answer = answerSchema.parse(sent);

  expect(answer.data.issues.nodes.map((node) => node.identifier)).toStrictEqual(['KET-1', 'KET-2']);
  expect(answer.data.issues.pageInfo).toStrictEqual({ hasNextPage: true, endCursor: '2' });
});
