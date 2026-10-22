import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

const FILES_LIMIT = 3000;

// Every path the PR changes, a renamed file's old path too, read page by page. GitHub lists at most
// 3000 files, so a list that long may hide one; the read then fails, as any failed read does.
export async function readPRFiles(run: Runner, slug: string, pr: number): Promise<string[]> {
  const result = await boundedRunner(run, CALL_MS)(['gh', 'api', '--paginate', `repos/${slug}/pulls/${pr}/files?per_page=100`, '--jq', '.[] | [.filename, .previous_filename // empty] | @tsv']).catch((error: unknown) => ({ code: 1, stdout: '', stderr: String(error) }));
  if (result.code !== 0) {
    throw new HqError('merge_blocked', `could not read the PR's changed files from GitHub, so the gate cannot pass: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
  }
  const records = result.stdout.split('\n').filter((record) => record !== '');
  if (records.length >= FILES_LIMIT) {
    throw new HqError('merge_blocked', `the PR lists ${FILES_LIMIT} changed files, GitHub's limit, so the gate cannot see them all`);
  }
  return records.flatMap((record) => record.split('\t'));
}
