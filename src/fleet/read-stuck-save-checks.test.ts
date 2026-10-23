import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AtcClient } from '../atc/atc-client.ts';
import { overrideEnv } from '../config/override-env.ts';
import { flush } from '../outbox/flush.ts';
import { resetFetchCache } from '../prompts/reset-fetch-cache.ts';
import { NOON_SYDNEY, at, createDefsRepo, fakeAtc, freshDb } from '../../test/helpers.ts';
import { ensureFleet } from './ensure-fleet.ts';
import { makeFleetClient } from './make-fleet-client.ts';
import { readStuckSaveChecks } from './read-stuck-save-checks.ts';
import type { FleetEntry } from './types.ts';

// One declared session, z-kettle, whose live prompt predates main's, so the fleet tick asks it to
// save 121 minutes after NOON_SYDNEY. `tick` runs the 5-minute timer and the watcher's flush.
function setupTest() {
  resetFetchCache();
  const base = freshDb();
  onTestFinished(base.cleanup);
  const kettle: FleetEntry = { name: 'z-kettle', cwd: `${base.dir}/work`, model: 'opus', prompt: 'main:skills/kettle/references/session-prompt.md', wake: false };
  const server = fakeAtc(base.dir, [Object.assign({ id: 'id-kettle', name: 'z-kettle', state: 'done', alive: true }, { pinned: true })]);
  onTestFinished(server.stop);
  createDefsRepo(base.dir, { 'skills/kettle/references/session-prompt.md': '```text\nYou are Kettle. Boil water when asked.\n```\n' });
  server.prompts.set('id-kettle', 'You are Kettle. Boil water slowly.');
  onTestFinished(overrideEnv('HQ_ATC_STATE', `${base.dir}/atc-state`));
  onTestFinished(overrideEnv('HQ_CLAUDE_JSON', `${base.dir}/claude.json`));
  onTestFinished(overrideEnv('HQ_QUIET', undefined));
  onTestFinished(overrideEnv('HQ_CLAUDE_PROJECTS', `${base.dir}/projects`));
  mkdirSync(`${base.dir}/work`, { recursive: true });
  mkdirSync(`${base.dir}/projects/-work`, { recursive: true });
  writeFileSync(`${base.dir}/claude.json`, JSON.stringify({ projects: { [`${base.dir}/work`]: { hasTrustDialogAccepted: true } } }));

  return {
    db: base.db,
    atc: server,
    async tick(minutes: number) {
      at(new Date(Date.parse(NOON_SYDNEY) + minutes * 60_000).toISOString());
      const peer = await AtcClient.open();
      onTestFinished(() => peer.close());
      await ensureFleet(base.db, makeFleetClient(peer), { dryRun: false, actor: 'hq-fleet', fleet: [kettle] });
      await flush(base.db);
    },
  };
}

test('it reports no stuck save request 59 minutes after the ask, while every read of its answer fails', async () => {
  const ctx = setupTest();
  await ctx.tick(0);
  await ctx.tick(121);
  ctx.atc.messageFailures.add('m-1');
  await ctx.tick(126);
  await ctx.tick(176);

  const checks = readStuckSaveChecks(ctx.db, new Date('2026-10-14T04:00:00Z'));

  expect(checks).toStrictEqual([{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }]);
});

test('it reports a stuck save request 61 minutes after the ask when every read of its answer failed', async () => {
  const ctx = setupTest();
  await ctx.tick(0);
  await ctx.tick(121);
  ctx.atc.messageFailures.add('m-1');
  await ctx.tick(126);
  await ctx.tick(176);

  const checks = readStuckSaveChecks(ctx.db, new Date('2026-10-14T04:02:00Z'));

  expect(checks).toStrictEqual([
    {
      key: 'fleet-save-unread:z-kettle',
      ok: false,
      line: "fleet: z-kettle (session id-kettl) was asked to save at 2026-10-14T03:01:00Z, and every read of its answer since failed: invented message.get failure",
    },
  ]);
});

test('it reports no stuck save request 61 minutes after the ask when one read of its answer succeeded', async () => {
  const ctx = setupTest();
  await ctx.tick(0);
  await ctx.tick(121);
  await ctx.tick(126);
  ctx.atc.messageFailures.add('m-1');
  await ctx.tick(131);
  await ctx.tick(176);

  const checks = readStuckSaveChecks(ctx.db, new Date('2026-10-14T04:02:00Z'));

  expect(checks).toStrictEqual([{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }]);
});
