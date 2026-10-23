import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { isFileRecord } from './is-file-record.ts';
import { OWNER } from './owner.ts';
import { parseFileRecord } from './parse-file-record.ts';
import { runGH } from './run-gh.ts';

const FILES_LIMIT = 3000;

export async function readChangedFiles(run: Runner, repo: string, number: string): Promise<string[]> {
  const listed = await runGH(run, ['api', '--paginate', `repos/${OWNER}/${repo}/pulls/${number}/files?per_page=100`, '--jq', '.[] | [.filename, .previous_filename // empty] | @tsv'], `files of ${repo}#${number}`);
  const records = listed.split('\n').filter((record) => isFileRecord(record));

  // GitHub lists at most 3000 files of a PR, so a full list may hide a changed file.
  if (records.length >= FILES_LIMIT) {
    throw new HqError('too_many_files', `${repo}#${number} lists ${FILES_LIMIT} files, GitHub's limit, so its changed files are unknown`);
  }

  // A renamed file also changed the path it left, which GitHub gives only as previous_filename.
  return records.flatMap((record) => parseFileRecord(record));
}
