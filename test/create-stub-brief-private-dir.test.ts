import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBriefPrivateDir } from './create-stub-brief-private-dir.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-stub-private-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it writes a briefs file with the table rows under the permission phrasing heading and the marker in a later section', () => {
  const ctx = setupTest();

  createStubBriefPrivateDir(ctx.root, { path: 'skills/kettle/briefs.private.md', rows: [['Code delivery', 'Work in <repo>.'], ['Deploy', 'Deploy to <environment>.']], marker: 'MARKER-ONE' });

  expect(readFileSync(join(ctx.root, 'skills/kettle/briefs.private.md'), 'utf8')).toBe(
    '# briefs\n\n## briefs (the opening)\n\nOpening text.\n\n## permission phrasing\n\nList only what is approved.\n\n| Action | Phrase in the brief |\n| ------ | ------------------- |\n| Code delivery | Work in <repo>. |\n| Deploy | Deploy to <environment>. |\n\n## the closing\n\nMARKER-ONE\n',
  );
});
