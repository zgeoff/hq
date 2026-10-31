import { expect, test } from 'bun:test';
import { findOwnerHeldTest } from './find-owner-held-test.ts';

test('it holds the agent kit, the skills, grants and fleet.json in hq for the owner', () => {
  const held = findOwnerHeldTest({ owner: 'zgeoff', repo: 'hq' });

  expect(
    ['agent-kit/brief.md', 'skills/kettle/SKILL.md', 'grants/still-ask.yaml', 'fleet.json', 'src/cli.ts'].map((path) => held?.(path)),
  ).toStrictEqual([true, true, true, true, false]);
});
