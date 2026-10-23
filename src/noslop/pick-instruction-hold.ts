import { match } from 'ts-pattern';
import type { MechanicalProof } from './mechanical-types.ts';

// The diff at the head: not read yet, unreadable, or read with hq's proof of it.
export type HeldDiffFact = { kind: 'unread' } | { kind: 'failed'; error: string } | { kind: 'read'; formattingOnly: boolean; proof: MechanicalProof };

export interface InstructionHoldFacts {
  lgtm: boolean;
  bot: boolean;
  exempted: boolean;
  mechanicalRecorded: boolean;
  diff: HeldDiffFact;
}

// needs-diff: nothing cheaper clears the hold, so the diff must be read and the facts picked again.
export type InstructionHoldVerdict = { kind: 'clear' } | { kind: 'held'; hint: string } | { kind: 'needs-diff' };

// Whether the PR's repo instruction files may merge without the owner's lgtm: a bot's PR, a
// z-review exemption record at the head, a formatting-only change, or a z-review mechanical record
// at the head that hq's proof of the diff at that head backs.
export function pickInstructionHold(facts: InstructionHoldFacts): InstructionHoldVerdict {
  if (facts.lgtm || facts.bot || facts.exempted) {
    return { kind: 'clear' };
  }
  return match(facts.diff)
    .with({ kind: 'unread' }, (): InstructionHoldVerdict => ({ kind: 'needs-diff' }))
    .with({ kind: 'failed' }, (diff): InstructionHoldVerdict => ({ kind: 'held', hint: `hq could not read the diff to prove it: ${diff.error}` }))
    .with({ kind: 'read' }, (diff) => pickReadHold(diff.formattingOnly, diff.proof, facts.mechanicalRecorded))
    .exhaustive();
}

function pickReadHold(formattingOnly: boolean, proof: MechanicalProof, recorded: boolean): InstructionHoldVerdict {
  if (formattingOnly) {
    return { kind: 'clear' };
  }
  if (proof.pass) {
    return recorded ? { kind: 'clear' } : { kind: 'held', hint: 'hq proves every held edit mechanical; z-review records that with hq pr mechanical' };
  }
  return { kind: 'held', hint: `hq does not prove the edits mechanical: ${proof.reason}${recorded ? " (z-review's record at this head does not hold)" : ''}` };
}
