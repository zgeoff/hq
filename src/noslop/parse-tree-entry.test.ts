import { expect, test } from 'bun:test';
import type { TreeEntry } from './parse-tree-entry.ts';
import { parseTreeEntry } from './parse-tree-entry.ts';

test.each<{ name: string; output: string; entry: TreeEntry }>([
  { name: 'an absent path', output: '', entry: { kind: 'absent' } },
  { name: 'a regular file', output: '100644 blob 4b40b6b1\tdocs/tea.md\n', entry: { kind: 'entry', entry: '100644 blob 4b40b6b1' } },
  { name: 'a symlink', output: '120000 blob 4b40b6b1\tdocs/tea.md\n', entry: { kind: 'entry', entry: '120000 blob 4b40b6b1' } },
  { name: 'another path than the one asked for', output: '100644 blob 4b40b6b1\tdocs/teapot.md\n', entry: { kind: 'unexpected', count: 1 } },
  { name: 'more than one line', output: '100644 blob 4b40b6b1\tdocs/tea.md\n100644 blob 5c51c7c2\tdocs/tea.md\n', entry: { kind: 'unexpected', count: 2 } },
])('it reads $name', (row) => {
  expect(parseTreeEntry(row.output, 'docs/tea.md')).toStrictEqual(row.entry);
});
