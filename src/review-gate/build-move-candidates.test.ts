import { expect, test } from 'bun:test';
import { buildMoveCandidates } from './build-move-candidates.ts';

test('it resolves a link relative to the file that holds it', () => {
  expect(buildMoveCandidates('skills/kettle/SKILL.md', 'refs/old.md', '../tea/new.md', ['file'])).toStrictEqual([['skills/kettle/refs/old.md', 'skills/tea/new.md']]);
});

test('it resolves a code path both ways', () => {
  expect(buildMoveCandidates('skills/kettle/SKILL.md', 'docs/old.md', 'docs/new.md', ['file', 'root'])).toStrictEqual([
    ['skills/kettle/docs/old.md', 'skills/kettle/docs/new.md'],
    ['docs/old.md', 'docs/new.md'],
  ]);
});

test('it resolves a leading slash to the root only', () => {
  expect(buildMoveCandidates('skills/kettle/SKILL.md', '/docs/old.md', '/docs/new.md', ['file'])).toStrictEqual([['docs/old.md', 'docs/new.md']]);
});

test('it gives none for a target that leaves the repo', () => {
  expect(buildMoveCandidates('SKILL.md', '../old.md', 'new.md', ['file'])).toBeNull();
});

test('it keeps the resolution that stays in the repo when the other leaves it', () => {
  expect(buildMoveCandidates('skills/kettle/SKILL.md', '../../docs/old.md', '../../docs/new.md', ['file', 'root'])).toStrictEqual([['docs/old.md', 'docs/new.md']]);
});
