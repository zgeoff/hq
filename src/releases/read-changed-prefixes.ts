import type { Runner } from '../runner/types.ts';
import { HqError } from '../errors.ts';
import { OWNER } from './owner.ts';
import { parseChangedPrefixes } from './parse-changed-prefixes.ts';
import { readChangedFiles } from './read-changed-files.ts';
import { runGH } from './run-gh.ts';

export async function readChangedPrefixes(run: Runner, repo: string, number: string, sha: string): Promise<string[]> {
  const content = await runGH(run, ['api', `repos/${OWNER}/${repo}/contents/release-please-config.json?ref=${sha}`, '--jq', '.content'], `release config of ${repo} at ${sha.slice(0, 7)}`);
  const files = await readChangedFiles(run, repo, number);
  if (!content.trim()) {
    throw new HqError('bad_config', `release-please-config.json of ${repo} is empty`);
  }
  return parseChangedPrefixes(content, files);
}
