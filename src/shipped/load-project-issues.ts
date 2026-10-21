import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import { buildOpenExpiry } from './build-open-expiry.ts';
import { findCacheEntries } from './find-cache-entries.ts';
import { findValidBody } from './find-valid-body.ts';
import { projectIssuesSchema } from './project-issues-schema.ts';
import type { ProjectIssue } from './types.ts';
import { upsertCacheEntries } from './upsert-cache-entries.ts';

interface IssuePage {
  issues: { nodes: { identifier: string; state: { type: string }; project: { name: string } | null }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

// Every issue in each named project, with its state type, for the projects' burndowns. A project's
// issues are kept 5 minutes, and read again sooner when what is kept does not fit the schema.
export async function loadProjectIssues(call: LinearCall, db: Database, projects: readonly string[], at: Date): Promise<ProjectIssue[]> {
  const issues: ProjectIssue[] = [],
    kept = await findCacheEntries(db, 'project', projects, at);
  for (const project of projects) {
    const body = kept.get(project),
      hit = body === undefined ? undefined : findValidBody(body, projectIssuesSchema);
    if (hit === undefined) {
      const fetched = await loadOneProject(call, project);
      await upsertCacheEntries(db, [{ kind: 'project', key: project, body: JSON.stringify(fetched), fetched_at: iso(at), expires_at: buildOpenExpiry(at) }]);
      issues.push(...fetched);
    } else {
      issues.push(...hit);
    }
  }
  return issues;
}

const QUERY = `query($after: String, $name: String!) { issues(first: 250, after: $after, filter: { project: { name: { eq: $name } } }) {
  nodes { identifier state { type } project { name } } pageInfo { hasNextPage endCursor } } }`;

async function loadOneProject(call: LinearCall, project: string): Promise<ProjectIssue[]> {
  const MAX_PAGES = 20,
    issues: ProjectIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = (await call(QUERY, { after, name: project })) as IssuePage;
    issues.push(...data.issues.nodes.map((node) => ({ id: node.identifier, statusType: node.state.type, project: node.project?.name ?? null })));
    if (!data.issues.pageInfo.hasNextPage) {
      return issues;
    }
    after = data.issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', `project ${project} has more than 5,000 issues`);
}
