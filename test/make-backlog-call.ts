import type { LinearCall } from '../src/linear/types.ts';
import { buildReadyPage } from './build-ready-page.ts';

interface BacklogSeed {
  identifier: string;
  project: string;
  type: string;
  labels?: string[];
}

// A Linear call that answers the Ready query with no issues and the Backlog query with the given
// issues, each complete and unblocked. With 'outage' the Backlog query fails as an outage does, and
// with 'silent' it never answers.
export function makeBacklogCall(issues: BacklogSeed[] | 'outage' | 'silent'): LinearCall {
  const description =
    '## Outcome\n\nThe kettle whistles.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the whistle.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle whistles in a test (unit test)\n\n## Actions\n\nCode delivery\n';
  const relations = { nodes: [], pageInfo: { hasNextPage: false } };
  const nodes = (Array.isArray(issues) ? issues : []).map((issue) => ({
    identifier: issue.identifier,
    title: 'whistle the kettle',
    description,
    priority: 2,
    createdAt: '2026-10-01T00:00:00Z',
    project: { name: issue.project, labels: { nodes: [] } },
    parent: null,
    labels: { nodes: [...(issue.labels ?? []).map((name) => ({ name })), { name: issue.type, parent: { name: 'Type' } }] },
    inverseRelations: relations,
  }));
  return (_query, variables) => {
    if (variables['state'] !== 'Backlog') {
      return Promise.resolve(buildReadyPage([], null));
    }
    if (issues === 'outage') {
      return Promise.reject(new Error('Linear answered 502: invented outage'));
    }
    if (issues === 'silent') {
      return Promise.withResolvers<unknown>().promise;
    }
    return Promise.resolve({ issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
  };
}
