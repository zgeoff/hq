import { expect, test } from 'bun:test';
import { buildRenameKey } from './build-rename-key.ts';
import { pickRenames } from './pick-renames.ts';

test.each<{ name: string; base: [string, string | null][]; logged: [string, string][]; keys: string[] }>([
  { name: 'a logged rename of a claimed pair whose old path is absent at the base', base: [['docs/old.md', null]], logged: [['docs/old.md', 'docs/new.md']], keys: [buildRenameKey('docs/old.md', 'docs/new.md')] },
  { name: 'no rename to another new path', base: [['docs/old.md', null]], logged: [['docs/old.md', 'docs/other.md']], keys: [] },
  { name: 'no rename when the old path is still at the base', base: [['docs/old.md', '100644 blob 4b40b6b1']], logged: [['docs/old.md', 'docs/new.md']], keys: [] },
  { name: 'no rename the log does not show', base: [['docs/old.md', null]], logged: [], keys: [] },
])('it counts $name', (row) => {
  expect([...pickRenames([['docs/old.md', 'docs/new.md']], new Map(row.base), row.logged)]).toStrictEqual(row.keys);
});
