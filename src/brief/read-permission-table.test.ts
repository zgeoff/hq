import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  expect(readPermissionTable(ctx.root)).toStrictEqual([{ action: 'Code delivery', phrase: 'Work in <repo>.' }]);
});

test('it reads the agent-delegation file when there is no delivery-lead one', () => {
  const ctx = setupTest();
  createStubBriefPrivateDir(ctx.root, { path: 'skills/agent-delegation/references/briefs.private.md', rows: [['Deploy', 'Deploy to <environment>.']], marker: 'CLOSING-MARKER' });

  expect(readPermissionTable(ctx.root)).toStrictEqual([{ action: 'Deploy', phrase: 'Deploy to <environment>.' }]);
});

test('it prefers the delivery-lead file when both exist', () => {
  const ctx = setupTest();
  createStubBriefPrivateDir(ctx.root, { path: 'skills/delivery-lead/references/briefs.private.md', rows: [['Post', 'First.']], marker: 'CLOSING-MARKER' });
  createStubBriefPrivateDir(ctx.root, { path: 'skills/agent-delegation/references/briefs.private.md', rows: [['Post', 'Second.']], marker: 'CLOSING-MARKER' });

  expect(readPermissionTable(ctx.root)).toStrictEqual([{ action: 'Post', phrase: 'First.' }]);
});

test('it rejects a checkout with no briefs file', () => {
  const ctx = setupTest();

  expect(() => readPermissionTable(ctx.root)).toThrow(`no briefs.private.md under ${ctx.root}; hq defs shows the hq-private clone`);
});

test('it rejects a file with no permission phrasing table, without quoting the file', () => {
  const ctx = setupTest();
  createStubBriefPrivateDir(ctx.root, { path: 'skills/delivery-lead/references/briefs.private.md', rows: [], marker: 'CLOSING-MARKER' });

  expect(() => readPermissionTable(ctx.root)).toThrow(`${join(ctx.root, 'skills/delivery-lead/references/briefs.private.md')} has no permission phrasing table`);
});
