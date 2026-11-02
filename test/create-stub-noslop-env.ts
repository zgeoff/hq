import type { Database } from 'bun:sqlite';
import { onTestFinished } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../src/config/override-env.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { FAKE_TOKEN } from './noslop-fake.ts';

export function createStubNoslopEnv(db: Database): void {
  const base = mkdtempSync(join(tmpdir(), 'hq-stub-noslop-'));
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));
  onTestFinished(overrideEnv('REVIEW_DIR', base));
  onTestFinished(overrideEnv('HQ_PROJECTS', join(base, 'projects')));
  onTestFinished(overrideEnv('HQ_REPOS', join(base, 'repos')));
  setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567' }));
}
