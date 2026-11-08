import { expect, test } from 'bun:test';
import type { MissingProof } from './collect-missing-proof.ts';
import { pickSkillProofVerdict } from './pick-skill-proof-verdict.ts';

test('it passes a bot, a recorded PR and a full proof without reading files', () => {
  const verdicts = [
    pickSkillProofVerdict({ bot: true, recorded: false, missing: [{ kind: 'line', line: 'Deslop' }], files: null }),
    pickSkillProofVerdict({ bot: false, recorded: true, missing: [{ kind: 'line', line: 'Deslop' }], files: null }),
    pickSkillProofVerdict({ bot: false, recorded: false, missing: [], files: null }),
  ];

  expect(verdicts).toStrictEqual([{ kind: 'pass' }, { kind: 'pass' }, { kind: 'pass' }]);
});

test('it asks for the changed files when the proof is incomplete', () => {
  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing: [{ kind: 'line', line: 'Cold read' }], files: null })).toStrictEqual({ kind: 'needs-files' });
});

test('it passes an incomplete proof when no skill text changed', () => {
  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing: [{ kind: 'line', line: 'Cold read' }], files: ['src/kettle.ts', 'skills/kettle/scripts/boil.sh'] })).toStrictEqual({ kind: 'pass' });
});

test('it names the first three skill files, counts the rest, and lists the lines to tick', () => {
  const files = ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md', 'skills/d/references/pour.md', 'skills/a/SKILL.md'];
  const missing: MissingProof[] = [
    { kind: 'line', line: 'chex prose, links and skill' },
    { kind: 'line', line: 'Cold read' },
  ];

  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing, files })).toStrictEqual({
    kind: 'blocked',
    reason: 'the PR changes skill text (skills/a/SKILL.md, skills/b/SKILL.md, skills/c/SKILL.md and 1 more) and its "## Checks" section lacks the skill proof: tick "- [x] chex prose, links and skill: cleared", "- [x] Cold read: <n> fixed, <n> declined"',
  });
});

test('it blocks with the decision record reason for an unticked Deslop and 1 of 2 declined findings listed', () => {
  const missing: MissingProof[] = [
    { kind: 'line', line: 'Deslop' },
    { kind: 'declined', counted: 2, listed: 1 },
  ];

  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing, files: ['skills/kettle/SKILL.md'] })).toStrictEqual({
    kind: 'blocked',
    reason: 'the PR changes skill text (skills/kettle/SKILL.md) and its "## Checks" section lacks the skill proof: tick "- [x] Deslop: <n> edits", and list 1 more declined finding under "Declined:" (the ticked lines count 2, the list holds 1)',
  });
});

test('it asks only for the declined findings when every line is ticked', () => {
  const missing: MissingProof[] = [{ kind: 'declined', counted: 3, listed: 0 }];

  expect(pickSkillProofVerdict({ bot: false, recorded: false, missing, files: ['skills/kettle/SKILL.md'] })).toStrictEqual({
    kind: 'blocked',
    reason: 'the PR changes skill text (skills/kettle/SKILL.md) and its "## Checks" section lacks the skill proof: list 3 more declined findings under "Declined:" (the ticked lines count 3, the list holds 0)',
  });
});
