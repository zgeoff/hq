import { expect, test } from 'bun:test';
import { loadDeclaredFleet } from './load-declared-fleet.ts';

test("z-q's start prompt is read from hq-private's main, like the skill sessions' prompts", () => {
  const fleet = loadDeclaredFleet();

  expect(fleet.find((entry) => entry.name === 'z-q')?.prompt).toBe('main:prompts/z-q.md');
  expect(fleet.filter((entry) => (entry.skills?.length ?? 0) > 0).every((entry) => entry.prompt.startsWith('main:skills/'))).toBe(true);
});
