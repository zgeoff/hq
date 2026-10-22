export interface OwnerHeldFacts {
  repo: string;
  pr: number;
  held: string[];
  lgtm: boolean;
  head: string;
  headNow: string | null;
}

export type OwnerHeldVerdict = { pass: true } | { pass: false; reason: string };

export function pickOwnerHeldVerdict(facts: OwnerHeldFacts): OwnerHeldVerdict {
  const held = [...new Set(facts.held)];
  if (held.length > 0 && !facts.lgtm) {
    return { pass: false, reason: `the PR changes owner-held files (${formatHeld(held)}) and needs the owner's lgtm at ${facts.head.slice(0, 7)}: hq pr answer ${facts.repo} ${facts.pr} lgtm --source <where the owner said it>` };
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
