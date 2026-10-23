import { match } from 'ts-pattern';
import { readHeadExemption } from '../pr-status/read-head-exemption.ts';
import { readHeadMechanical } from '../pr-status/read-head-mechanical.ts';
import { buildSlug } from './build-slug.ts';
import { isBotAuthor } from './is-bot-author.ts';
import type { PRAuthor } from './is-bot-author.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { pickInstructionHold } from './pick-instruction-hold.ts';
import type { HeldDiffFact, InstructionHoldFacts } from './pick-instruction-hold.ts';
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

// The facts the hold turns on, cheap reads first: the diff at the head is read and proved only when
// the owner's lgtm, a bot author and an exemption record leave the hold standing.
export async function checkInstructionHold(request: PRRequest, parsed: ParsedRepo, input: InstructionHoldInput): Promise<InstructionHold> {
  const facts: InstructionHoldFacts = {
    lgtm: input.lgtm,
    bot: isBotAuthor(input.author),
    exempted: readHeadExemption(request.db, parsed.repo, request.pr, input.head) !== null,
    mechanicalRecorded: readHeadMechanical(request.db, parsed.repo, request.pr, input.head) !== null,
    diff: { kind: 'unread' },
  };
  const first = pickInstructionHold(facts);
  const verdict = first.kind === 'needs-diff' ? pickInstructionHold({ ...facts, diff: await readDiffFact(request, parsed, input) }) : first;
  return match(verdict)
    .with({ kind: 'clear' }, () => ({ clear: true, hint: '' }))
    .with({ kind: 'held' }, (held) => ({ clear: false, hint: held.hint }))
    .with({ kind: 'needs-diff' }, () => ({ clear: false, hint: 'hq did not read the diff at the head' }))
    .exhaustive();
}

async function readDiffFact(request: PRRequest, parsed: ParsedRepo, input: InstructionHoldInput): Promise<HeldDiffFact> {
  return await readHeldDiffs({ run: request.run, slug: buildSlug(parsed), repo: parsed.repo, pr: request.pr, head: input.head, paths: input.files, repoDir: request.repoDir }).then(
    (diffs): HeldDiffFact => ({ kind: 'read', formattingOnly: diffs.formattingOnly, proof: proveMechanical(diffs.files, diffs.facts) }),
    (error: unknown): HeldDiffFact => ({ kind: 'failed', error: error instanceof Error ? error.message : String(error) }),
  );
}
