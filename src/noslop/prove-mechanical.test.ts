import { expect, test } from 'bun:test';
import { buildStubFileDiff } from '../../test/build-stub-file-diff.ts';
import { buildStubMoveFacts } from '../../test/build-stub-move-facts.ts';
import { proveMechanical } from './prove-mechanical.ts';

test('it passes a PR whose only held change is a link target that moved to the same file', () => {
  const diff = buildStubFileDiff('skills/kettle/SKILL.md', { start: 6, removed: ['See [care](refs/old.md).'], added: ['See [care](refs/new.md).'] });
  const facts = buildStubMoveFacts({ base: [['skills/kettle/refs/old.md', 'aaa']], head: [['skills/kettle/refs/new.md', 'aaa']] });

  expect(proveMechanical([{ path: 'skills/kettle/SKILL.md', diff }], facts)).toStrictEqual({ pass: true, files: ['skills/kettle/SKILL.md'], lines: 1 });
});

test('it refuses a link whose new target exists but is not the old file', () => {
  const diff = buildStubFileDiff('skills/kettle/SKILL.md', { start: 6, removed: ['See [care](refs/old.md).'], added: ['See [care](refs/new.md).'] });
  const facts = buildStubMoveFacts({ base: [['skills/kettle/refs/old.md', 'aaa']], head: [['skills/kettle/refs/new.md', 'zzz']] });

  expect(proveMechanical([{ path: 'skills/kettle/SKILL.md', diff }], facts)).toStrictEqual({ pass: false, reason: 'skills/kettle/SKILL.md line 6: skills/kettle/refs/old.md to skills/kettle/refs/new.md is not proved to be the same file moved' });
});

test.each([
  ['a reworded sentence', ['Boil the water.'], ['Heat the water.'], 'skills/kettle/SKILL.md line 3: the words of the line changed'],
  ['a changed table cell', ['| kettle | boils |'], ['| teapot | boils |'], 'skills/kettle/SKILL.md line 3: a table cell changed'],
  ['an added line', [], ['Boil the water.'], 'skills/kettle/SKILL.md line 3: a line was added or removed'],
  ['a removed line', ['Boil the water.'], [], 'skills/kettle/SKILL.md line 3: a line was added or removed'],
  ['a swapped pair of lines', ['Boil.', 'Pour.'], ['Pour.', 'Boil.'], 'skills/kettle/SKILL.md line 3: the words of the line changed'],
])('it refuses %s', (_label, removed, added, reason) => {
  const diff = buildStubFileDiff('skills/kettle/SKILL.md', { start: 3, removed, added });

  expect(proveMechanical([{ path: 'skills/kettle/SKILL.md', diff }], buildStubMoveFacts({}))).toStrictEqual({ pass: false, reason });
});

test('it refuses the whole PR when one line of a mechanical file is not', () => {
  const diff = ['--- a/skills/kettle/SKILL.md', '+++ b/skills/kettle/SKILL.md', '@@ -2 +2 @@', '-bun 1.0.0', '+bun 1.1.0', '@@ -9 +9 @@', '-Boil.', '+Steam.', ''].join('\n');

  expect(proveMechanical([{ path: 'skills/kettle/SKILL.md', diff }], buildStubMoveFacts({}))).toStrictEqual({ pass: false, reason: 'skills/kettle/SKILL.md line 9: the words of the line changed' });
});

test('it passes a version bump between version-shaped tokens', () => {
  const diff = buildStubFileDiff('AGENTS.md', { start: 1, removed: ['Use bun 1.3.4.'], added: ['Use bun 1.4.0.'] });

  expect(proveMechanical([{ path: 'AGENTS.md', diff }], buildStubMoveFacts({}))).toStrictEqual({ pass: true, files: ['AGENTS.md'], lines: 1 });
});

test('it refuses a version change to a token that is not version-shaped', () => {
  const diff = buildStubFileDiff('AGENTS.md', { start: 1, removed: ['Use bun 1.3.4.'], added: ['Use bun latest.'] });

  expect(proveMechanical([{ path: 'AGENTS.md', diff }], buildStubMoveFacts({}))).toMatchObject({ pass: false });
});

test('it refuses a new file', () => {
  const diff = 'new file mode 100644\n@@ -0,0 +1 @@\n+Brew.\n';

  expect(proveMechanical([{ path: 'skills/tea/SKILL.md', diff }], buildStubMoveFacts({}))).toStrictEqual({ pass: false, reason: 'skills/tea/SKILL.md: the file is new' });
});

test('it leaves out of the files a held file whose diff is empty', () => {
  const files = [
    { path: 'AGENTS.md', diff: '' },
    { path: 'skills/kettle/SKILL.md', diff: buildStubFileDiff('skills/kettle/SKILL.md', { start: 1, removed: ['Use bun 1.3.4.'], added: ['Use bun 1.4.0.'] }) },
  ];

  expect(proveMechanical(files, buildStubMoveFacts({}))).toStrictEqual({ pass: true, files: ['skills/kettle/SKILL.md'], lines: 1 });
});
