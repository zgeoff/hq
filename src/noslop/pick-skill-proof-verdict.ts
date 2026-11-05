import { isSkillProse } from './is-skill-prose.ts';
import type { MissingProof, ProofLine } from './collect-missing-proof.ts';

export interface SkillProofFacts {
  bot: boolean;
  recorded: boolean;
  missing: MissingProof[];

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
  return { kind: 'blocked', reason: `the PR changes skill text (${shown}) and its "## Checks" section lacks the skill proof: ${describeFixes(facts.missing)}` };
}

const LINE_FORMS: Record<ProofLine, string> = {
  'chex prose, links and skill': 'chex prose, links and skill: cleared',
  'Cold read': 'Cold read: <n> fixed, <n> declined',
  Deslop: 'Deslop: <n> edits',
};

function describeFixes(missing: MissingProof[]): string {
  const lines = missing.flatMap((item) => (item.kind === 'line' ? [`"- [x] ${LINE_FORMS[item.line]}"`] : []));
  const declined = missing.flatMap((item) => (item.kind === 'declined' ? [`list ${item.counted - item.listed} more declined ${item.counted - item.listed === 1 ? 'finding' : 'findings'} under "Declined:" (the ticked lines count ${item.counted}, the list holds ${item.listed})`] : []));
  const parts = [...(lines.length === 0 ? [] : [`tick ${lines.join(', ')}`]), ...declined];
  return parts.join(', and ');
}
