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

interface DeclaredSession {
  name: string;
  id: string;
  mainPrompt: string;
  livePrompt: string;
}

// Wires the fake atc, a temp work tree and the env the fleet tick reads. Each test declares its own
// session: a live prompt that differs from main's makes the tick ask it to save 121 minutes after
// NOON_SYDNEY. `tick` runs the 5-minute timer and the watcher's flush.
function setupTest() {
  resetFetchCache();
  const base = freshDb();
  onTestFinished(base.cleanup);
  const sessions: { id: string; name: string; state: string; alive: boolean; pinned: boolean }[] = [];
  const server = fakeAtc(base.dir, sessions);
  onTestFinished(server.stop);
  onTestFinished(overrideEnv('HQ_ATC_STATE', `${base.dir}/atc-state`));
  onTestFinished(overrideEnv('HQ_CLAUDE_JSON', `${base.dir}/claude.json`));
  onTestFinished(overrideEnv('HQ_QUIET', undefined));
  onTestFinished(overrideEnv('HQ_CLAUDE_PROJECTS', `${base.dir}/projects`));
  mkdirSync(`${base.dir}/work`, { recursive: true });
  mkdirSync(`${base.dir}/projects/-work`, { recursive: true });
  writeFileSync(`${base.dir}/claude.json`, JSON.stringify({ projects: { [`${base.dir}/work`]: { hasTrustDialogAccepted: true } } }));
  const fleet: FleetEntry[] = [];

  return {
    db: base.db,
    atc: server,
    declare(declared: DeclaredSession) {
      createDefsRepo(base.dir, { [`skills/${declared.name}/references/session-prompt.md`]: `\`\`\`text\n${declared.mainPrompt}\n\`\`\`\n` });
      sessions.push({ id: declared.id, name: declared.name, state: 'done', alive: true, pinned: true });
      server.prompts.set(declared.id, declared.livePrompt);
      fleet.push({ name: declared.name, cwd: `${base.dir}/work`, model: 'opus', prompt: `main:skills/${declared.name}/references/session-prompt.md`, wake: false });
    },
    async tick(minutes: number) {
      at(new Date(Date.parse(NOON_SYDNEY) + minutes * 60_000).toISOString());
      const peer = await AtcClient.open();
      onTestFinished(() => peer.close());
      await ensureFleet(base.db, makeFleetClient(peer), { dryRun: false, actor: 'hq-fleet', fleet });
      await flush(base.db);
    },
  };
}

test('it reports no stuck save request 59 minutes after the ask, while every read of its answer fails', async () => {
  const ctx = setupTest();
  ctx.declare({ name: 'z-kettle', id: 'id-kettle', mainPrompt: 'You are Kettle. Boil water when asked.', livePrompt: 'You are Kettle. Boil water slowly.' });
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
  ctx.declare({ name: 'z-kettle', id: 'id-kettle', mainPrompt: 'You are Kettle. Boil water when asked.', livePrompt: 'You are Kettle. Boil water slowly.' });
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
      line: 'fleet: z-kettle (session id-kettl) was asked to save at 2026-10-14T03:01:00Z, and no read of its answer has worked for over an hour: invented message.get failure',
    },
  ]);
});

test('it reports no stuck save request 61 minutes after the ask when a read of its answer succeeded within the last hour', async () => {
  const ctx = setupTest();
  ctx.declare({ name: 'z-kettle', id: 'id-kettle', mainPrompt: 'You are Kettle. Boil water when asked.', livePrompt: 'You are Kettle. Boil water slowly.' });
  await ctx.tick(0);
  await ctx.tick(121);
  await ctx.tick(126);
  ctx.atc.messageFailures.add('m-1');
  await ctx.tick(131);
  await ctx.tick(176);

  const checks = readStuckSaveChecks(ctx.db, new Date('2026-10-14T04:02:00Z'));

  expect(checks).toStrictEqual([{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }]);
});

test('it reports a stuck save request when one read succeeded just after the ask and no read has worked for 61 minutes since', async () => {
  const ctx = setupTest();
  ctx.declare({ name: 'z-kettle', id: 'id-kettle', mainPrompt: 'You are Kettle. Boil water when asked.', livePrompt: 'You are Kettle. Boil water slowly.' });
  await ctx.tick(0);
  await ctx.tick(121);
  await ctx.tick(126);
  ctx.atc.messageFailures.add('m-1');
  await ctx.tick(131);
  await ctx.tick(186);

  const checks = readStuckSaveChecks(ctx.db, new Date('2026-10-14T04:07:00Z'));

  expect(checks).toStrictEqual([
    {
      key: 'fleet-save-unread:z-kettle',
      ok: false,
      line: 'fleet: z-kettle (session id-kettl) was asked to save at 2026-10-14T03:01:00Z, and no read of its answer has worked for over an hour: invented message.get failure',
    },
  ]);
});
