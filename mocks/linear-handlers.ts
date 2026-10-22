import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import type { ReadyPageAnswer } from '../src/lanes/read-linear-ready.ts';
import type { ReadyIssue } from '../src/lanes/types.ts';
import type { IssuesFilter } from '../src/linear/read-issue-pages.ts';

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

// Linear's GraphQL API, answering as the key's user, kettle-bot. A query with team and state
// variables is the Ready query, answered in one page from the issues in that team and state. An
// `ids` query answers the issues whose identifier, or a previous one, is among the ids. A `filter`
// query answers one page, of its `first` size, of the issues that match its team key, state names and updatedAt
// bound, and a `teamKey` query the workflow states of that team. A `slugID`
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

export interface LinearWorkflowStateRecord {
  team: string;
  name: string;
}

// The workflow states each team holds; test/msw-preload.ts empties it after each test.
export const linearWorkflowStates: LinearWorkflowStateRecord[] = [];

// The documents Linear holds; test/msw-preload.ts empties it after each test.
export const linearDocuments: LinearDocumentRecord[] = [];

async function readLinearAnswer(info: LinearRequest): Promise<Response> {
  const body: unknown = await info.request.json().catch(() => null);
  const variables = typeof body === 'object' && body !== null && 'variables' in body && typeof body.variables === 'object' && body.variables !== null ? body.variables : {};
  if ('filter' in variables) {
    const query = typeof body === 'object' && body !== null && 'query' in body && typeof body.query === 'string' ? body.query : '';
    return HttpResponse.json({ data: buildIssuesPageAnswer(variables, query) });
  }
  if ('teamKey' in variables) {
    return HttpResponse.json({ data: { workflowStates: { nodes: linearWorkflowStates.filter((state) => state.team === variables.teamKey).map((state) => ({ name: state.name })) } } });
  }
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

const keyFilterSchema = z.object({ eq: z.string() });

const stateNamesSchema = z.object({ in: z.array(z.string()) });

const filterSchema = z.object({
  team: z.object({ key: keyFilterSchema }),
  state: z.object({ name: stateNamesSchema }),
  updatedAt: z.object({ gte: z.string() }).optional(),
});

interface IssuesPageVariables {
  filter?: unknown;
  after?: unknown;
}

const DEFAULT_TIME = '2026-10-01T00:00:00.000Z';

// Linear answers 50 issues a page when the query sets no `first`.
const DEFAULT_FIRST = 50;

function buildIssuesPageAnswer(variables: IssuesPageVariables, query: string) {
  const filter: IssuesFilter = filterSchema.parse(variables.filter);
  const first = Number(/\bfirst:\s*(?<first>\d+)/u.exec(query)?.groups?.['first'] ?? DEFAULT_FIRST);
  const start = typeof variables.after === 'string' ? Number(variables.after) : 0;
  const matching = linearIssues.filter((issue) => isInFilter(issue, filter));
  const nodes = matching.slice(start, start + first).map((issue) => buildIssuePageNode(issue));
  const next = start + first;
  return { issues: { nodes, pageInfo: { hasNextPage: next < matching.length, endCursor: next < matching.length ? String(next) : null } } };
}

function isInFilter(issue: LinearIssueRecord, filter: IssuesFilter): boolean {
  const inTeamAndState = issue.team === filter.team.key.eq && filter.state.name.in.includes(issue.state);
  return inTeamAndState && (filter.updatedAt === undefined || Date.parse(issue.updatedAt ?? DEFAULT_TIME) >= Date.parse(filter.updatedAt.gte));
}

function buildIssuePageNode(issue: LinearIssueRecord) {
  return {
    identifier: issue.identifier,
    title: issue.title ?? `Descale the ${issue.identifier} kettle`,
    url: `https://linear.invalid/issue/${issue.identifier}`,
    state: { name: issue.state, type: issue.stateType },
    project: issue.project === null ? null : { name: issue.project },
    priority: issue.priority?.value ?? 0,
    priorityLabel: issue.priority?.name ?? 'No priority',
    labels: { nodes: issue.labels.map((name) => ({ name })) },
    parent: issue.parent === null ? null : { identifier: issue.parent },
    createdAt: issue.createdAt ?? DEFAULT_TIME,
    updatedAt: issue.updatedAt ?? DEFAULT_TIME,
    completedAt: issue.completedAt ?? null,
    canceledAt: issue.canceledAt ?? null,
    description: issue.description ?? null,
  };
}

export interface LinearIssueRecord extends ReadyIssue {
  team: string;
  state: string;

  // Linear's state type, such as completed or canceled.
  stateType: string;
  previousIdentifiers: string[];

  // What an issues page carries beyond the Ready query; each has a default.
  title?: string;
  priority?: { value: number; name: string };
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  description?: string | null;
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
