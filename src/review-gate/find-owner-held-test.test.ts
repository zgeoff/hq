import { expect, test } from 'bun:test';
import { findOwnerHeldTest } from './find-owner-held-test.ts';

test('it holds the agent kit, the skills, grants and fleet.json in hq for the owner', () => {
  const held = findOwnerHeldTest({ owner: 'zgeoff', repo: 'hq' });

  expect(
    ['agent-kit/brief.md', 'skills/kettle/SKILL.md', 'grants/still-ask.yaml', 'fleet.json', 'src/cli.ts'].map((path) => held?.(path)),
  ).toStrictEqual([true, true, true, true, false]);
});

test('it leaves a script and a code file under skills in hq to the review', () => {
  const held = findOwnerHeldTest({ owner: 'zgeoff', repo: 'hq' });

  expect(['skills/kettle/scripts/boil.sh', 'skills/kettle/scripts/boil.test.sh', 'skills/kettle/references/descale.md'].map((path) => held?.(path))).toStrictEqual([false, false, true]);
});

test('it holds only the skill text under skills in hq-private', () => {
  const held = findOwnerHeldTest({ owner: 'zgeoff', repo: 'hq-private' });

  expect(['skills/kettle/SKILL.md', 'skills/kettle/scripts/boil.sh'].map((path) => held?.(path))).toStrictEqual([true, false]);
});
