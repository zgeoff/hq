import { expect, test } from 'bun:test';
import { parseRenameLog } from './parse-rename-log.ts';

test.each<{ name: string; output: string; renames: [string, string][] }>([
  { name: 'nothing for an empty log', output: '', renames: [] },
  { name: 'one rename', output: 'R100\0docs/old.md\0docs/new.md\0', renames: [['docs/old.md', 'docs/new.md']] },
  { name: 'renames from two commits, newest first', output: 'R100\0docs/mid.md\0docs/new.md\0R087\0docs/old.md\0docs/mid.md\0', renames: [['docs/mid.md', 'docs/new.md'], ['docs/old.md', 'docs/mid.md']] },
  { name: 'a path with a tab and a non-ASCII letter, unquoted', output: 'R100\0docs/old.md\0docs/caf\u00E9\tnoir.md\0', renames: [['docs/old.md', 'docs/caf\u00E9\tnoir.md']] },
  { name: 'nothing for a status that is not a rename', output: 'M\0docs/old.md\0', renames: [] },
])('it reads $name', (row) => {
  expect(parseRenameLog(row.output)).toStrictEqual(row.renames);
});
