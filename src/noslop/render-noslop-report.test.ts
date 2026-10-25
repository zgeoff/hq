import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { buildNoslopReport } from './build-noslop-report.ts';
import { recordRound } from './record-round.ts';
import type { RoundRow } from './record-round.ts';
import { renderNoslopReport } from './render-noslop-report.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-report-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return {
    db,
    addRound: (round: Partial<RoundRow>) =>
      recordRound(db, {
        repo: 'widgets',
        pr: 7,
        kind: 'review',
        startedAt: '2026-10-18T01:00:00Z',
        endedAt: '2026-10-18T01:01:00Z',
        ms: 60_000,
        ok: true,
        head: null,
        base: null,
        depth: 'standard',
        findings: [],
        failedCalls: 0,
        conclusion: null,
        open: [],
        error: null,
        sha: 'abc1234',
        ...round,
      }),
  };
}

const FIND_A = { id: 'aaaaaaaaaaaaaaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' },
  FIND_B = { id: 'bbbbbbbbbbbbbbbb', lens: 'style', severity: 'low', title: 'Lid is loose' };

test('it prints one block per PR', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [FIND_A, FIND_B] });
  ctx.addRound({ kind: 'check', conclusion: 'failure', ms: 4000, open: [{ id: FIND_A.id, title: FIND_A.title, reason: 'no reply' }] });

  expect(renderNoslopReport(buildNoslopReport(ctx.db))).toBe(
    [
      'widgets#7',
      '  reviews: 1 ok, 0 failed (0 extra rounds)',
      '  findings: 2 (1 high, 1 low)',
      '  latest check: failure, 1 answered, open: aaaaaaaaaaaaaaaa',
      '  wall time: 64 s',
      '  churn: 1 round with a new finding, 0 repeat-class, late 0 of 0, 0 main-merge (2 unknown), 0 base-move',
      '',
      'totals: 1 PR',
      '  churn: 1 round with a new finding, 0 repeat-class, late 0 of 0, 0 main-merge (2 unknown), 0 base-move',
    ].join('\n'),
  );
});
