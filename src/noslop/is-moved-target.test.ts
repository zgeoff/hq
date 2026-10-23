import { expect, test } from 'bun:test';
import { buildStubMoveFacts } from '../../test/build-stub-move-facts.ts';
import { buildRenameKey } from './build-rename-key.ts';
import { isMovedTarget } from './is-moved-target.ts';

test('it proves a move when the old path at the base holds the new path at the head, and the old path is gone', () => {
  const facts = buildStubMoveFacts({ base: [['refs/old.md', 'aaa']], head: [['refs/new.md', 'aaa']] });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(true);
});

test('it refuses a new target that exists with other content', () => {
  const facts = buildStubMoveFacts({
    base: [
      ['refs/old.md', 'aaa'],
      ['refs/new.md', 'bbb'],
    ],
    head: [['refs/new.md', 'bbb']],
  });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(false);
});

test('it refuses a move when the old path still exists at the head', () => {
  const facts = buildStubMoveFacts({
    base: [['refs/old.md', 'aaa']],
    head: [
      ['refs/old.md', 'aaa'],
      ['refs/new.md', 'aaa'],
    ],
  });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(false);
});

test('it refuses a new path that is absent at the head', () => {
  const facts = buildStubMoveFacts({ base: [['refs/old.md', 'aaa']] });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(false);
});

test('it proves a move the base branch already made, when the PR leaves the new file alone', () => {
  const facts = buildStubMoveFacts({ base: [['refs/new.md', 'bbb']], head: [['refs/new.md', 'bbb']], renames: [buildRenameKey('refs/old.md', 'refs/new.md')] });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(true);
});

test('it refuses a move the base branch made when the PR changes the new file', () => {
  const facts = buildStubMoveFacts({ base: [['refs/new.md', 'bbb']], head: [['refs/new.md', 'ccc']], renames: [buildRenameKey('refs/old.md', 'refs/new.md')] });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(false);
});

test('it refuses a missing old path that no base commit renamed to the new one', () => {
  const facts = buildStubMoveFacts({ base: [['refs/new.md', 'bbb']], head: [['refs/new.md', 'bbb']] });

  expect(isMovedTarget({ path: 'SKILL.md', line: 4, candidates: [['refs/old.md', 'refs/new.md']] }, facts)).toBe(false);
});

test('it takes a claim proved by any one of its resolutions', () => {
  const facts = buildStubMoveFacts({ base: [['docs/old.md', 'aaa']], head: [['docs/new.md', 'aaa']] });
  const candidates: [string, string][] = [
    ['skills/kettle/docs/old.md', 'skills/kettle/docs/new.md'],
    ['docs/old.md', 'docs/new.md'],
  ];

  expect(isMovedTarget({ path: 'skills/kettle/SKILL.md', line: 4, candidates }, facts)).toBe(true);
});
