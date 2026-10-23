import { z } from 'zod';
import { HqError } from '../errors.ts';
import { runGH } from '../releases/run-gh.ts';
import type { Runner } from '../runner/types.ts';

export interface PublishedRelease {
  tag: string;
  publishedAt: string;
}

const rowsSchema = z.array(z.object({ tag_name: z.string(), draft: z.boolean(), prerelease: z.boolean(), published_at: z.string().nullable() }));

// The newest 30 GitHub releases of owner/repo that are published, drafts and prereleases left out.
// A failed or malformed answer throws.
export async function readReleaseList(run: Runner, repo: string): Promise<PublishedRelease[]> {
  const out = await runGH(run, ['api', `repos/${repo}/releases?per_page=30`, '--jq', '[.[] | {tag_name, draft, prerelease, published_at}]'], `releases of ${repo}`);
  let raw: unknown;
  try {
    raw = JSON.parse(out);
  } catch {
    throw new HqError('bad_releases', `releases of ${repo} are not JSON`);
  }
  const rows = rowsSchema.safeParse(raw);
  if (!rows.success) {
    throw new HqError('bad_releases', `releases of ${repo} have an unexpected shape`);
  }
  return rows.data.flatMap((row) => (row.draft || row.prerelease || row.published_at === null ? [] : [{ tag: row.tag_name, publishedAt: row.published_at }]));
}
