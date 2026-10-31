import { join } from 'node:path';
import { HqError } from '../errors.ts';
import { parseRecordLine } from './parse-record-line.ts';
import type { BriefFiles } from './types.ts';

const WHERE = 'skills/delivery-lead/references/design-brief.private.md';

// The record line of the private design brief in the hq-private checkout, for the issue. Nothing
// else in that file is read out of this function, and an error names the file, never its text.
export function readRecordLine(files: BriefFiles, privateDir: string, issueID: string): string {
  const found = join(privateDir, WHERE);
  if (files.readKind(found) !== 'file') {
    throw new HqError('not_found', `no design-brief.private.md under ${privateDir}; hq defs shows the hq-private clone`);
  }
  const line = parseRecordLine(files.readText(found), issueID);
  if (line === null) {
    throw new HqError('bad_state', `${found} has no record line`);
  }
  return line;
}
