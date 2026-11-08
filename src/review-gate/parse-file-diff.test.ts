import { expect, test } from 'bun:test';
import { parseFileDiff } from './parse-file-diff.ts';

test('it reads hunks of removed and added lines with the head line they start at', () => {
  const diff = ['diff --git a/AGENTS.md b/AGENTS.md', 'index 1a2b3c..4d5e6f 100644', '--- a/AGENTS.md', '+++ b/AGENTS.md', '@@ -3 +3 @@', '-boil v1.0.0', '+boil v1.1.0', '@@ -9,2 +9,0 @@', '-steam', '-whistle', ''].join('\n');

  expect(parseFileDiff(diff)).toStrictEqual({
    hunks: [
      { start: 3, removed: ['boil v1.0.0'], added: ['boil v1.1.0'] },
      { start: 9, removed: ['steam', 'whistle'], added: [] },
    ],
  });
});

test('it keeps a removed line that starts with dashes', () => {
  expect(parseFileDiff(['--- a/AGENTS.md', '+++ b/AGENTS.md', '@@ -1 +1 @@', '--- rule', '+-- other', ''].join('\n'))).toStrictEqual({ hunks: [{ start: 1, removed: ['-- rule'], added: ['-- other'] }] });
});

test.each([
  ['a new file', 'new file mode 100644', 'the file is new'],
  ['a deleted file', 'deleted file mode 100644', 'the file is deleted'],
  ['a mode change', 'old mode 100644\nnew mode 100755', 'the file mode changed'],
  ['a rename', 'similarity index 90%\nrename from a.md\nrename to b.md', 'the file is renamed'],
  ['a binary file', 'Binary files a/x.png and b/x.png differ', 'the file is binary'],
])('it refuses %s', (_label, header, reason) => {
  expect(parseFileDiff(`diff --git a/x b/x\n${header}\n`)).toStrictEqual({ refused: reason });
});

test('it refuses a change to the final newline', () => {
  expect(parseFileDiff(['@@ -1 +1 @@', '-boil', String.raw`\ No newline at end of file`, '+boil', ''].join('\n'))).toStrictEqual({ refused: 'a line ending at the end of the file changed' });
});

test('it reads an empty diff as no hunks', () => {
  expect(parseFileDiff('')).toStrictEqual({ hunks: [] });
});
