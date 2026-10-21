import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { setMeta } from '../db/set-meta.ts';
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

test('it names the key when the noslop meta is malformed', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'noslop', '{"repos":"atc"}');

  expect(() => loadNoslopSettings(ctx.db)).toThrow("meta 'noslop' is malformed at repos");
});
