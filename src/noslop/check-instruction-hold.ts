import { readHeadExemption } from '../pr-status/read-head-exemption.ts';
import { readHeadMechanical } from '../pr-status/read-head-mechanical.ts';
import { buildSlug } from './build-slug.ts';
import { isBotAuthor } from './is-bot-author.ts';
import type { PRAuthor } from './is-bot-author.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { proveMechanical } from './prove-mechanical.ts';
import { readHeldDiffs } from './read-held-diffs.ts';
import type { PRRequest } from './run-review-check.ts';

export interface InstructionHold {
  clear: boolean;

  // Why the hold stands, for the block message; empty when it is clear.
  hint: string;
}

export interface InstructionHoldInput {
  head: string;
  author: PRAuthor;
  files: string[];
  lgtm: boolean;
}

// Whether the PR's repo instruction files may merge without the owner's lgtm: a bot's PR, a
// z-review exemption record at the head, a formatting-only change, or a z-review mechanical record
// at the head that hq's proof of the diff at that head backs. Cheap reads first, git last.
export async function checkInstructionHold(request: PRRequest, parsed: ParsedRepo, input: InstructionHoldInput): Promise<InstructionHold> {
  if (input.lgtm || isBotAuthor(input.author) || readHeadExemption(request.db, parsed.repo, request.pr, input.head) !== null) {
    return { clear: true, hint: '' };
  }
  const read = await readHeldDiffs({ run: request.run, slug: buildSlug(parsed), repo: parsed.repo, pr: request.pr, head: input.head, paths: input.files, repoDir: request.repoDir }).then(
    (diffs) => ({ diffs }),
    (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
  );
  if ('error' in read) {
    return { clear: false, hint: `hq could not read the diff to prove it: ${read.error}` };
  }
  if (read.diffs.formattingOnly) {
    return { clear: true, hint: '' };
  }
  const proof = proveMechanical(read.diffs.files, read.diffs.facts);
  const recorded = readHeadMechanical(request.db, parsed.repo, request.pr, input.head) !== null;
  if (proof.pass) {
    return recorded ? { clear: true, hint: '' } : { clear: false, hint: 'hq proves every held edit mechanical; z-review records that with hq pr mechanical' };
  }
  return { clear: false, hint: `hq does not prove the edits mechanical: ${proof.reason}${recorded ? ' (z-review\'s record at this head does not hold)' : ''}` };
}
