import { expect, test } from 'bun:test';
import { pickSkillProofVerdict } from './pick-skill-proof-verdict.ts';

test('it passes a bot, a recorded PR and a full proof without reading files', () => {
  const verdicts = [
    pickSkillProofVerdict({ bot: true, recorded: false, missing: ['Deslop'], files: null }),
    pickSkillProofVerdict({ bot: false, recorded: true, missing: ['Deslop'], files: null }),
    pickSkillProofVerdict({ bot: false, recorded: false, missing: [], files: null }),
  ];

  expect(verdicts).toStrictEqual([{ kind: 'pass' }, { kind: 'pass' }, { kind: 'pass' }]);
});

test('it asks for the changed files when the proof is incomplete', () => {
  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing: ['Cold read'], files: null })).toStrictEqual({ kind: 'needs-files' });
});

test('it passes an incomplete proof when no skill text changed', () => {
  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing: ['Cold read'], files: ['src/kettle.ts', 'skills/kettle/scripts/boil.sh'] })).toStrictEqual({ kind: 'pass' });
});

test('it names the first three skill files, counts the rest, and lists the missing headings', () => {
  const files = ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md', 'skills/d/references/pour.md', 'skills/a/SKILL.md'];

  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing: ['Skill checks', 'Deslop'], files })).toStrictEqual({
    kind: 'blocked',
    reason: 'the PR changes skill text (skills/a/SKILL.md, skills/b/SKILL.md, skills/c/SKILL.md and 1 more) and its description lacks the proof: add "## Skill checks", "## Deslop", each with text under it (the chex output, each cold-read finding with its answer, the deslop changes or "none")',
  });
});
