import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { BRIEF_LIMIT_BYTES } from './fit-brief.ts';
import type { BriefFiles } from './types.ts';

// Measures a finished brief, the prompt text alone, in bytes as hq brief counts them, and refuses
// one over the limit. One trailing newline, as a shell redirect leaves, is not counted.
export function runBriefCheckCommand(files: Pick<BriefFiles, 'readKind' | 'readText'>, path: string | undefined): Out {
  if (path === undefined) {
    throw new HqError('bad_args', 'hq brief check <file> needs the file that holds the brief');
  }
  const kind = files.readKind(path);
  if (kind === 'missing') {
    throw new HqError('not_found', `no file at ${path}`);
  }
  if (kind !== 'file') {
    throw new HqError('bad_args', `${path} is not a regular file`);
  }

  // `hq brief GEO-n > file` ends the file with one newline the prompt does not hold
  const bytes = Buffer.byteLength(files.readText(path).replace(/\n$/u, ''));
  if (bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${bytes} bytes, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes, limit: BRIEF_LIMIT_BYTES });
  }
  return { data: { bytes, limit: BRIEF_LIMIT_BYTES }, text: `ok: ${bytes} bytes` };
}
