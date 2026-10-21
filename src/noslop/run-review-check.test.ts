import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
import { setMeta } from '../db/set-meta.ts';
import { runReviewCheck } from './run-review-check.ts';

const PINNED = '0123456789abcdef0123456789abcdef01234567';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-review-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));
  onTestFinished(overrideEnv('REVIEW_DIR', base));
  onTestFinished(overrideEnv('HQ_PROJECTS', join(base, 'projects')));
  onTestFinished(overrideEnv('HQ_REPOS', join(base, 'repos')));

  return {
    base,
    db,
    listWidgets: () => setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: PINNED })),
  };
}

test('it runs and stores a noslop check for the PR', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await expect(runReviewCheck({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).resolves.toMatchObject({ conclusion: 'success', title: 'All answered', open: [], sha: PINNED });

  expect(ctx.db.query('SELECT kind, ok, conclusion FROM noslop_rounds').all()).toStrictEqual([{ kind: 'check', ok: 1, conclusion: 'success' }]);
  expect(fake.of('bun')[0]?.opts?.cwd).toBe(`${ctx.base}/repos/zgeoff/widgets`);
});

test('it refuses a check when no commit is pinned', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runReviewCheck({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7 })).rejects.toMatchObject({ code: 'bad_config' });

  expect(fake.of('bun')).toStrictEqual([]);
});
