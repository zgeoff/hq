import { expect, test } from 'bun:test';
import { parseRenameLog } from './parse-rename-log.ts';

test.each<{ name: string; output: string; renames: [string, string][] }>([
  { name: 'nothing for an empty log', output: '', renames: [] },
  { name: 'one rename', output: 'R100\tdocs/old.md\tdocs/new.md\n', renames: [['docs/old.md', 'docs/new.md']] },
  { name: 'renames from two commits, newest first', output: 'R100\tdocs/mid.md\tdocs/new.md\n\nR087\tdocs/old.md\tdocs/mid.md\n', renames: [['docs/mid.md', 'docs/new.md'], ['docs/old.md', 'docs/mid.md']] },
  { name: 'nothing for a status that is not a rename', output: 'M\tdocs/old.md\n', renames: [] },
])('it reads $name', (row) => {
  expect(parseRenameLog(row.output)).toStrictEqual(row.renames);
});
