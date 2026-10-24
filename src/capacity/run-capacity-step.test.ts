import { expect, onTestFinished, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { runCapacityStep } from './run-capacity-step.ts';
import type { CapacityProbe } from './types.ts';

// A database, the pacing.json path, no 1Password token, and a probe whose every source fails, so
// only the lane plan decides an alert.
function setupTest() {
  const fresh = freshDb(),
    probe: CapacityProbe = {
      run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'invented: no such source' }),
      readText: () => Promise.reject(new Error('no cloud here')),
      readFile: () => Promise.resolve(''),
      readMs: 100,
    },
    saved = process.env['OP_SERVICE_ACCOUNT_TOKEN'];
  onTestFinished(fresh.cleanup);
  delete process.env['OP_SERVICE_ACCOUNT_TOKEN'];
  onTestFinished(() => saved !== undefined && (process.env['OP_SERVICE_ACCOUNT_TOKEN'] = saved));
  return { db: fresh.db, pacing: join(fresh.dir, 'pacing.json'), probe };
}

// The hold rule needs 2 samples in a row: these are 5 minutes apart at noon Sydney.
test.each([
  ['it opens lanes:plan for imp lanes whose 9 slots of 2048 MiB cross impd\'s line', { imp: { impMib: 2048 }, lanes: { imp: { kettle: 6, teapot: 3 }, local: { flexible: 1 } } }, ['lanes:plan']],
  ['it opens nothing for imp lanes whose 7 slots fit under the line', { imp: { impMib: 2048 }, lanes: { imp: { kettle: 4, teapot: 3 }, local: { flexible: 5 } } }, []],
  ['it opens nothing for a pacing.json with no lanes', { imp: { impMib: 2048 } }, []],
])('%s', async (_case, pacing, opened) => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify(pacing));
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-14T01:00:00Z'));
  await runCapacityStep(ctx.db, ctx.probe, ctx.pacing, 'hq-lanes');
  process.env['HQ_NOW'] = '2026-10-14T01:05:00Z';

  await expect(runCapacityStep(ctx.db, ctx.probe, ctx.pacing, 'hq-lanes').then((step) => step.tick.opened)).resolves.toStrictEqual(opened);
});

test("the Claude alert names pacing.json's launch limit", async () => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, providers: { claude: { threshold: 95, unattended: true, target: 'imp' } } }));
  ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-14T00:58:00Z', 'abcdef012345', 10, 91);
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-14T01:00:00Z'));
  await runCapacityStep(ctx.db, ctx.probe, ctx.pacing, 'hq-lanes');
  process.env['HQ_NOW'] = '2026-10-14T01:05:00Z';

  await runCapacityStep(ctx.db, ctx.probe, ctx.pacing, 'hq-lanes');

  expect(ctx.db.query("SELECT DISTINCT text FROM outbox WHERE text LIKE '%Claude%'").all()).toStrictEqual([
    { text: 'Capacity watch: something is over its line.\n- Claude: 7-day usage at 91%, early warning at 85% (launch limit 95%) (account abcdef)\nhq capacity shows every reading. hq changed nothing.' },
  ]);
});
