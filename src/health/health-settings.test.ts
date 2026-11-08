import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { setMeta } from '../db/set-meta.ts';
import { HEALTH_DEFAULTS } from './health-defaults.ts';
import { healthSettings } from './health-settings.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return { db };
}

test('#healthSettings returns the defaults when nothing is stored', () => {
  const ctx = setupTest();

  expect(healthSettings(ctx.db)).toStrictEqual(HEALTH_DEFAULTS);
});

test('#healthSettings applies a stored value over its default', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'health_settings', JSON.stringify({ diskMinPct: 25, ignoreUnits: 'kettle.service' }));

  expect(healthSettings(ctx.db)).toStrictEqual({ ...HEALTH_DEFAULTS, diskMinPct: 25, ignoreUnits: 'kettle.service' });
});

test('#healthSettings falls back to the default for a stored value of the wrong type and drops an unknown key', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'health_settings', JSON.stringify({ diskMinPct: 'lots', ignoreUnits: 3, toaster: 1 }));

  expect(healthSettings(ctx.db)).toStrictEqual(HEALTH_DEFAULTS);
});
