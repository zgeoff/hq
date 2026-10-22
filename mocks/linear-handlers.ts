import { HttpResponse, http } from 'msw';
import type { ReadyPageAnswer } from '../src/lanes/read-linear-ready.ts';
import type { ReadyIssue } from '../src/lanes/types.ts';

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

// Linear's GraphQL API, answering as the key's user, kettle-bot. A query with team and state
// variables is the Ready query, answered in one page from the issues in that team and state. An
// `ids` query answers the issues whose identifier, or a previous one, is among the ids. A `slugID`
// query answers the documents with that slug ID, and an `id` query that document.
export const linearHandlers = [http.post(LINEAR_GRAPHQL_URL, (info) => readLinearAnswer(info))];

interface LinearRequest {
  request: Request;
}

export interface LinearDocumentRecord {
  id: string;
  slugID: string;
  content: string;
}

// The documents Linear holds; test/msw-preload.ts empties it after each test.
export const linearDocuments: LinearDocumentRecord[] = [];

async function readLinearAnswer(info: LinearRequest): Promise<Response> {
  const body: unknown = await info.request.json().catch(() => null);
  const variables = typeof body === 'object' && body !== null && 'variables' in body && typeof body.variables === 'object' && body.variables !== null ? body.variables : {};
  if ('team' in variables && 'state' in variables) {
    return HttpResponse.json({ data: buildReadyAnswer(variables.team, variables.state) });
  }
  if ('ids' in variables) {
    return HttpResponse.json({ data: buildIssuesAnswer(variables.ids) });
  }
  if ('slugID' in variables) {
    return HttpResponse.json({ data: { documents: { nodes: linearDocuments.filter((document) => document.slugID === variables.slugID).map((document) => ({ content: document.content })) } } });
  }
  if ('id' in variables) {
    const found = linearDocuments.find((document) => document.id === variables.id);

    // Linear's document(id:) returns Document!, so a missing document is an error, not null.
    const answer = found ? { data: { document: { content: found.content } } } : { data: null, errors: [{ message: 'Entity not found: Document' }] };
    return HttpResponse.json(answer);
  }
  return HttpResponse.json({ data: { viewer: { id: 'kettle-bot' } } });
}

export interface LinearIssueRecord extends ReadyIssue {
  team: string;
  state: string;

  // Linear's state type, such as completed or canceled.
  stateType: string;
  previousIdentifiers: string[];
}

// The issues Linear holds; test/msw-preload.ts empties it after each test.
export const linearIssues: LinearIssueRecord[] = [];

function buildReadyAnswer(team: unknown, state: unknown): ReadyPageAnswer {
  const nodes = linearIssues
    .filter((issue) => issue.team === team && issue.state === state)
    .map((issue) => ({
      identifier: issue.identifier,
      project: issue.project === null ? null : { name: issue.project },
      labels: { nodes: issue.labels.map((name) => ({ name })) },
      parent: issue.parent === null ? null : { identifier: issue.parent },
    }));
  return { issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } };
}

function buildIssuesAnswer(ids: unknown) {
  const asked = Array.isArray(ids) ? ids : [];
  const nodes = linearIssues
    .filter((issue) => [issue.identifier, ...issue.previousIdentifiers].some((identifier) => asked.includes(identifier)))
    .map((issue) => ({ identifier: issue.identifier, previousIdentifiers: issue.previousIdentifiers, state: { type: issue.stateType } }));
  return { issues: { nodes } };
}
