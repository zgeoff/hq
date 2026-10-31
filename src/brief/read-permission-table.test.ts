import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeBriefFiles } from './build-node-brief-files.ts';
import { createStubBriefPrivateDir } from '../../test/create-stub-brief-private-dir.ts';
import { readPermissionTable } from './read-permission-table.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-private-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it reads the table of the delivery-lead file', () => {
  const ctx = setupTest();
  createStubBriefPrivateDir(ctx.root, { path: 'skills/delivery-lead/references/briefs.private.md', rows: [['Code delivery', 'Work in <repo>.']], marker: 'CLOSING-MARKER' });

  expect(readPermissionTable(buildNodeBriefFiles(), ctx.root)).toStrictEqual([{ action: 'Code delivery', phrase: 'Work in <repo>.' }]);
});

test('it rejects a checkout with no briefs file', () => {
  const ctx = setupTest();

  expect(() => readPermissionTable(buildNodeBriefFiles(), ctx.root)).toThrow(`no briefs.private.md under ${ctx.root}; hq defs shows the hq-private clone`);
});

test('it rejects a file with no permission phrasing table, without quoting the file', () => {
  const ctx = setupTest();
  createStubBriefPrivateDir(ctx.root, { path: 'skills/delivery-lead/references/briefs.private.md', rows: [], marker: 'CLOSING-MARKER' });

  expect(() => readPermissionTable(buildNodeBriefFiles(), ctx.root)).toThrow(`${join(ctx.root, 'skills/delivery-lead/references/briefs.private.md')} has no permission phrasing table`);
});

test.each([
  ['an empty file', ''],
  ['prose with no heading', 'Approve only what the issue names.\n'],
  ['the heading with no table under it', '## permission phrasing\n\nList only what is approved.\n'],
  ['a header row and separator with no rows', '## permission phrasing\n\n| Action | Phrase in the brief |\n| ------ | ------------------- |\n'],
  ['a table under a look-alike heading', '## permission phrasing (old)\n\n| Code delivery | Work in <repo>. |\n'],
  ['a table only inside a code fence', '## permission phrasing\n\n```md\n| Code delivery | Work in <repo>. |\n```\n'],
  ['a table after a higher heading ends the section', '## permission phrasing\n\n# appendix\n\n| Code delivery | Work in <repo>. |\n'],
  ['rows with an empty action cell', '## permission phrasing\n\n|  | Work in <repo>. |\n'],
  ['one-cell rows', '## permission phrasing\n\n| Code delivery |\n'],
])('it refuses %s as having no permission phrasing table', (_, text) => {
  const ctx = setupTest();
  const path = join(ctx.root, 'skills/delivery-lead/references/briefs.private.md');
  mkdirSync(join(ctx.root, 'skills/delivery-lead/references'), { recursive: true });
  writeFileSync(path, text);

  expect(() => readPermissionTable(buildNodeBriefFiles(), ctx.root)).toThrow(expect.objectContaining({ code: 'bad_state', message: `${path} has no permission phrasing table` }));
});

test('it refuses a directory where the briefs file belongs', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.root, 'skills/delivery-lead/references/briefs.private.md'), { recursive: true });

  expect(() => readPermissionTable(buildNodeBriefFiles(), ctx.root)).toThrow(expect.objectContaining({ code: 'not_found' }));
});

test('it refuses a link to nothing where the briefs file belongs', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.root, 'skills/delivery-lead/references'), { recursive: true });
  symlinkSync(join(ctx.root, 'gone.md'), join(ctx.root, 'skills/delivery-lead/references/briefs.private.md'));

  expect(() => readPermissionTable(buildNodeBriefFiles(), ctx.root)).toThrow(expect.objectContaining({ code: 'not_found' }));
});

test('it reads the table through a link to a real briefs file', () => {
  const ctx = setupTest();
  createStubBriefPrivateDir(ctx.root, { path: 'elsewhere/briefs.private.md', rows: [['Code delivery', 'Work in <repo>.']], marker: 'CLOSING-MARKER' });
  mkdirSync(join(ctx.root, 'skills/delivery-lead/references'), { recursive: true });
  symlinkSync(join(ctx.root, 'elsewhere/briefs.private.md'), join(ctx.root, 'skills/delivery-lead/references/briefs.private.md'));

  expect(readPermissionTable(buildNodeBriefFiles(), ctx.root)).toStrictEqual([{ action: 'Code delivery', phrase: 'Work in <repo>.' }]);
});
