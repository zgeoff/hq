import type { Runner } from '../runner/types.ts';
import { HqError } from '../errors.ts';
import { isFileRecord } from './is-file-record.ts';
import { OWNER } from './owner.ts';
import { parseChangedPrefixes } from './parse-changed-prefixes.ts';
import { runGH } from './run-gh.ts';

const FILES_LIMIT = 3000;

export async function readChangedPrefixes(run: Runner, repo: string, number: string, sha: string): Promise<string[]> {
  const content = await runGH(run, ['api', `repos/${OWNER}/${repo}/contents/release-please-config.json?ref=${sha}`, '--jq', '.content'], `release config of ${repo} at ${sha.slice(0, 7)}`);
  const listed = await runGH(run, ['api', '--paginate', `repos/${OWNER}/${repo}/pulls/${number}/files?per_page=100`, '--jq', '.[] | [.filename, .previous_filename // empty] | @tsv'], `files of ${repo}#${number}`);
  if (!content.trim()) {
    throw new HqError('bad_config', `release-please-config.json of ${repo} is empty`);
  }
  const records = listed.split('\n').filter(isFileRecord);

  // GitHub lists at most 3000 files of a PR, so a full list may hide a changed package.
  if (records.length >= FILES_LIMIT) {
    throw new HqError('too_many_files', `${repo}#${number} lists ${FILES_LIMIT} files, GitHub's limit, so its changed packages are unknown`);
  }

  // A renamed file also changed the package it left, which GitHub gives only as previous_filename.
  return parseChangedPrefixes(content, records.flatMap((record) => record.split('\t')));
}
