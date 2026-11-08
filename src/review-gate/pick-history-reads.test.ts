import { expect, test } from 'bun:test';
import { pickHistoryReads } from './pick-history-reads.ts';

test.each<{ name: string; base: [string, string | null][]; reads: [string, string][] }>([
  { name: 'a move whose old path is absent at the base', base: [['docs/old.md', null]], reads: [['docs/old.md', 'docs/new.md']] },
  { name: 'a move whose old path the base does not list', base: [], reads: [['docs/old.md', 'docs/new.md']] },
  { name: 'no move whose old path is still at the base', base: [['docs/old.md', '100644 blob 4b40b6b1']], reads: [] },
])('it reads the history for $name', (row) => {
  expect(pickHistoryReads([['docs/old.md', 'docs/new.md']], new Map(row.base))).toStrictEqual(row.reads);
});
