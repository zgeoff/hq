import { match } from 'ts-pattern';
import type { MechanicalProof } from './types.ts';

// The diff at the head: not read yet, unreadable, or read with hq's proof of it.
export type HeldDiffFact = { kind: 'unread' } | { kind: 'failed'; error: string } | { kind: 'read'; proof: MechanicalProof };

export interface InstructionHoldFacts {
  lgtm: boolean;
  bot: boolean;
  exempted: boolean;
  mechanicalRecorded: boolean;
  diff: HeldDiffFact;
}

// needs-diff: nothing cheaper clears the hold, so the diff must be read and the facts picked again.
export type InstructionHoldVerdict = { kind: 'clear' } | { kind: 'held'; hint: string } | { kind: 'needs-diff' };

// Whether the PR's repo instruction files may merge without the owner's lgtm. hq clears no
// whitespace change itself: a space or a blank line can change what a command does, so a
// formatting-only PR needs z-review's exemption like any other policy exception.
export function pickInstructionHold(facts: InstructionHoldFacts): InstructionHoldVerdict {
  if (facts.lgtm || facts.bot || facts.exempted) {
    return { kind: 'clear' };
  }
  return match(facts.diff)
    .with({ kind: 'unread' }, (): InstructionHoldVerdict => ({ kind: 'needs-diff' }))
    .with({ kind: 'failed' }, (diff): InstructionHoldVerdict => ({ kind: 'held', hint: `hq could not read the diff to prove it: ${diff.error}` }))
    .with({ kind: 'read' }, (diff) => pickReadHold(diff.proof, facts.mechanicalRecorded))
    .exhaustive();
}

function pickReadHold(proof: MechanicalProof, recorded: boolean): InstructionHoldVerdict {
  if (proof.pass) {
    return recorded ? { kind: 'clear' } : { kind: 'held', hint: 'hq proves every held edit mechanical; z-review records that with hq pr mechanical' };
  }
  return { kind: 'held', hint: `hq does not prove the edits mechanical: ${proof.reason}${recorded ? " (z-review's record at this head does not hold)" : ''}` };
}
