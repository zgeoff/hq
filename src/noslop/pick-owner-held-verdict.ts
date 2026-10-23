export interface OwnerHeldFacts {
  repo: string;
  pr: number;
  held: string[];

  // The zgeoff repo instruction files the PR changes, and whether hq clears their hold, with the
  // reason when it does not.
  instruction: string[];
  instructionClear: boolean;
  instructionHint: string;
  lgtm: boolean;
  head: string;
  headNow: string | null;
}

export type OwnerHeldVerdict = { pass: true } | { pass: false; reason: string };

export function pickOwnerHeldVerdict(facts: OwnerHeldFacts): OwnerHeldVerdict {
  const held = [...new Set(facts.held)];
  const instruction = [...new Set(facts.instruction)];
  const answer = `hq pr answer ${facts.repo} ${facts.pr} lgtm --source <where the owner said it>`;
  if (held.length > 0 && !facts.lgtm) {
    return { pass: false, reason: `the PR changes owner-held files (${formatHeld(held)}) and needs the owner's lgtm at ${facts.head.slice(0, 7)}: ${answer}` };
  }
  if (instruction.length > 0 && !facts.instructionClear) {
    const records = `z-review records a mechanical edit with hq pr mechanical ${facts.repo} ${facts.pr}, or a policy exception with hq pr exempt ${facts.repo} ${facts.pr} --rule boundary|ci-design-sync|rename|repo-sync --note <why>`;
    return { pass: false, reason: `the PR changes repo instruction files (${formatHeld(instruction)}) and needs the owner's lgtm at ${facts.head.slice(0, 7)}: ${answer}; ${records}; ${facts.instructionHint}` };
  }
  if (facts.headNow !== facts.head) {
    return { pass: false, reason: `the PR's head moved from ${facts.head.slice(0, 7)} while the gate ran, so no pass: run the gate again` };
  }
  return { pass: true };
}

function formatHeld(held: string[]): string {
  const shown = held.slice(0, 3).join(', ');
  return held.length > 3 ? `${shown} and ${held.length - 3} more` : shown;
}
