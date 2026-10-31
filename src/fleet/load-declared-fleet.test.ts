import { expect, test } from 'bun:test';
import { loadDeclaredFleet } from './load-declared-fleet.ts';

test("z-q's start prompt is read from hq-private's main, like the skill sessions' prompts", () => {
  const fleet = loadDeclaredFleet();

  expect(fleet.find((entry) => entry.name === 'z-q')?.prompt).toBe('main:prompts/z-q.md');
  expect(fleet.filter((entry) => (entry.skills?.length ?? 0) > 0).every((entry) => entry.prompt.startsWith('main:skills/'))).toBe(true);
});

test("it takes each session's start prompt from its first skill, never a shared one", () => {
  const fleet = loadDeclaredFleet();

  expect(fleet.filter((entry) => (entry.skills?.length ?? 0) > 0).map((entry) => [entry.name, entry.prompt])).toStrictEqual(
    fleet.filter((entry) => (entry.skills?.length ?? 0) > 0).map((entry) => [entry.name, `main:skills/${entry.skills?.[0]}/references/session-prompt.md`]),
  );
  expect(fleet.find((entry) => entry.name === 'z-stu')?.prompt).toBe('main:skills/intake/references/session-prompt.md');
});
