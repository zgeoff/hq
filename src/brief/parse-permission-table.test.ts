import { expect, test } from 'bun:test';
import { parsePermissionTable } from './parse-permission-table.ts';

test('it reads the rows under the permission phrasing heading and stops at the next heading', () => {
  const rows = parsePermissionTable(
    ['# briefs', '', '| Action | Phrase |', '| - | - |', '| Nope | outside the section |', '', '## permission phrasing', '', 'Intro.', '', '| Action | Phrase in the brief |', '| ------ | -------- |', '| Code delivery | Work in <repo>. |', '| Deploy | Deploy to <environment>. |', '', '## closing', '', '| Post | not read |'].join('\n'),
  );

  expect(rows).toStrictEqual([
    { action: 'Code delivery', phrase: 'Work in <repo>.' },
    { action: 'Deploy', phrase: 'Deploy to <environment>.' },
  ]);
});

test('it gives no rows for a text with no such heading', () => {
  expect(parsePermissionTable('## permission phrasing (other)\n\n| Post | x |\n')).toStrictEqual([]);
});
