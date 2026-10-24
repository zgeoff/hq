import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { isNoslopListed } from './is-noslop-listed.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return { base, db };
}

test('it lists no repo until noslop is turned on', () => {
  const ctx = setupTest();

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: [], sha: null, caps: {} });
  expect(isNoslopListed(loadNoslopSettings(ctx.db), 'zgeoff', 'widgets')).toBe(false);
});
