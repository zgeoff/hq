import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { parseLinearData } from '../linear/parse-linear-data.ts';
import type { LinearCall } from '../linear/types.ts';
import { buildOpenExpiry } from './build-open-expiry.ts';
import { findCacheEntries } from './find-cache-entries.ts';
import { findValidBody } from './find-valid-body.ts';
import { projectIssuesSchema } from './project-issues-schema.ts';
import type { ProjectIssue } from './types.ts';
import { upsertCacheEntries } from './upsert-cache-entries.ts';

export async function loadProjectIssues(call: LinearCall, db: Database, projects: readonly string[], at: Date): Promise<ProjectIssue[]> {
  const issues: ProjectIssue[] = [];
  const kept = await findCacheEntries(db, 'project', projects, at);
  for (const project of projects) {
    const body = kept.get(project);
    const hit = body === undefined ? undefined : findValidBody(body, projectIssuesSchema);
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

const IssueNodeSchema = z.object({ identifier: z.string(), state: z.object({ type: z.string() }), project: z.object({ name: z.string() }).nullable() });
const PageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const IssuePageSchema = z.object({ issues: z.object({ nodes: z.array(IssueNodeSchema), pageInfo: PageInfoSchema }) });

async function loadOneProject(call: LinearCall, project: string): Promise<ProjectIssue[]> {
  const MAX_PAGES = 20;
  const issues: ProjectIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await call(QUERY, { after, name: project });
    const data: z.output<typeof IssuePageSchema> = parseLinearData(answer, IssuePageSchema);
    issues.push(...data.issues.nodes.map((node) => ({ id: node.identifier, statusType: node.state.type, project: node.project?.name ?? null })));
    if (!data.issues.pageInfo.hasNextPage) {
      return issues;
    }
    after = data.issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', `project ${project} has more than 5,000 issues`);
}
