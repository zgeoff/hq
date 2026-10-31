import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { findFencedBlock } from './find-fenced-block.ts';
import { readRefFile } from './read-ref-file.ts';

// The prompt in the first text fence of a brief template of zgeoff/hq at the commit.
export async function readBriefTemplate(run: Runner, sha: string, path: string): Promise<string> {
  const text = await readRefFile(run, sha, path);
  if (text === null) {
    throw new HqError('not_found', `${path} is missing at ${sha}`);
  }
  const template = findFencedBlock(text, null);
  if (template === null) {
    throw new HqError('bad_state', `${path} at ${sha} has no text fence holding the prompt`);
  }
  return template;
}
