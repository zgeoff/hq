import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { OWNER } from './owner.ts';
import { parseReleases } from './parse-releases.ts';
import { runGH } from './run-gh.ts';
import type { Release } from './types.ts';

// Many packages release in a monorepo, so a first page of 30 could hide an older package's tag.
export async function readPackageReleases(run: Runner, repo: string): Promise<Release[]> {
  const out = await runGH(run, ['api', '--paginate', '--slurp', `repos/${OWNER}/${repo}/releases?per_page=100`], `releases of ${repo}`);
  let pages: unknown;
  try {
    pages = JSON.parse(out);
  } catch {
    throw new HqError('bad_releases', `releases of ${repo} are not JSON`);
  }
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new HqError('bad_releases', `releases of ${repo} are not pages of releases`);
  }
  return parseReleases(pages.flat(), /^/u);
}
