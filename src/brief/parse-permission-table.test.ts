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

test('it stops at a higher-level heading, so a table in a later section is not read', () => {
  const rows = parsePermissionTable(['# briefs', '', '## permission phrasing', '', '| Action | Phrase |', '| - | - |', '| Code delivery | Work in <repo>. |', '', '# appendix', '', '| Stray | SENTINEL-IN-A-LATER-SECTION |'].join('\n'));

  expect(rows).toStrictEqual([{ action: 'Code delivery', phrase: 'Work in <repo>.' }]);
});

test('it stops at the next heading of the same level', () => {
  const rows = parsePermissionTable(['## permission phrasing', '', '| Code delivery | Work in <repo>. |', '', '## closing', '', '| Stray | SENTINEL-IN-A-LATER-SECTION |'].join('\n'));

  expect(rows).toStrictEqual([{ action: 'Code delivery', phrase: 'Work in <repo>.' }]);
});

test('it reads neither a heading nor a row inside a code fence', () => {
  const rows = parsePermissionTable(['## permission phrasing', '', '| Code delivery | Work in <repo>. |', '', '```md', '## example', '| Stray | SENTINEL-IN-A-FENCE |', '```', '', '| Deploy | Deploy to <environment>. |'].join('\n'));

  expect(rows).toStrictEqual([
    { action: 'Code delivery', phrase: 'Work in <repo>.' },
    { action: 'Deploy', phrase: 'Deploy to <environment>.' },
  ]);
});
