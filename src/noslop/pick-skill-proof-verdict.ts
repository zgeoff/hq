import { isSkillProse } from './is-skill-prose.ts';
import type { ProofSection } from './collect-missing-proof.ts';

export interface SkillProofFacts {
  bot: boolean;
  recorded: boolean;
  missing: ProofSection[];

  // The PR's changed files, or null while hq has not read them.
  files: string[] | null;
}

export type SkillProofVerdict = { kind: 'pass' } | { kind: 'needs-files' } | { kind: 'blocked'; reason: string };

export function pickSkillProofVerdict(facts: SkillProofFacts): SkillProofVerdict {
  if (facts.bot || facts.recorded || facts.missing.length === 0) {
    return { kind: 'pass' };
  }
  if (facts.files === null) {
    return { kind: 'needs-files' };
  }
  const prose = [...new Set(facts.files.filter((file) => isSkillProse(file)))];
  if (prose.length === 0) {
    return { kind: 'pass' };
  }
  const shown = prose.length > 3 ? `${prose.slice(0, 3).join(', ')} and ${prose.length - 3} more` : prose.join(', ');
  const headings = facts.missing.map((section) => `"## ${section}"`).join(', ');
  return { kind: 'blocked', reason: `the PR changes skill text (${shown}) and its description lacks the proof: add ${headings}, each with text under it (the chex output, each cold-read finding with its answer, the deslop changes or "none")` };
}
