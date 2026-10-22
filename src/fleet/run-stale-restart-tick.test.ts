import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AtcClient } from '../atc/atc-client.ts';
import { overrideEnv } from '../config/override-env.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { ensureFleet } from './ensure-fleet.ts';
import { makeFleetClient } from './make-fleet-client.ts';
import { refreshSchema } from './refresh-schema.ts';
import { staleSinceSchema } from './stale-since-schema.ts';
import type { FleetEntry } from './types.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { flush } from '../outbox/flush.ts';
import { logEvent } from '../log-event.ts';
import { resetFetchCache } from '../prompts/reset-fetch-cache.ts';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at, createDefsRepo, fakeAtc, freshDb } from '../../test/helpers.ts';

const KETTLE = 'skills/kettle/references/session-prompt.md',
  NEW_PROMPT = 'You are Kettle. Boil water when asked.',
  OLD_PROMPT = 'You are Kettle. Boil water slowly.',
  URN = 'skills/urn/references/session-prompt.md';

interface RosterSession {
  id: string;
  name: string;
  state: string;
  createdAt?: number;
  agentSessionID?: string;
}

function setupTest(config: { sessions?: RosterSession[]; cwd?: string } = {}) {
  resetFetchCache();
  const base = freshDb(),
    kettle: FleetEntry = { name: 'z-kettle', cwd: config.cwd ?? `${base.dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: false },
    roster = (config.sessions ?? [{ id: 'id-kettle', name: 'z-kettle', state: 'done' }]).map((s) => Object.assign(s, { alive: true, pinned: true })),
    server = fakeAtc(base.dir, roster),
    steward: FleetEntry = { name: 'z-stu', cwd: `${base.dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: false, roles: ['owner'] },
    urn: FleetEntry = { name: 'z-urn', cwd: `${base.dir}/work`, model: 'opus', prompt: `main:${URN}`, wake: false };
  createDefsRepo(base.dir, { [KETTLE]: `\`\`\`text\n${NEW_PROMPT}\n\`\`\`\n`, [URN]: '```text\nYou are Urn. Keep the water hot.\n```\n' });
  onTestFinished(base.cleanup);
  onTestFinished(server.stop);
  onTestFinished(overrideEnv('HQ_ATC_STATE', `${base.dir}/atc-state`));
  onTestFinished(overrideEnv('HQ_CLAUDE_JSON', `${base.dir}/claude.json`));
  onTestFinished(overrideEnv('HQ_QUIET', undefined));
  onTestFinished(overrideEnv('HQ_CLAUDE_PROJECTS', `${base.dir}/projects`));
  mkdirSync(`${base.dir}/work`, { recursive: true });
  mkdirSync(`${base.dir}/projects/-work`, { recursive: true });
  writeFileSync(`${base.dir}/claude.json`, JSON.stringify({ projects: { [`${base.dir}/work`]: { hasTrustDialogAccepted: true } } }));
  for (const session of roster) {
    const prompt = session.name === 'z-urn' ? 'You are Urn. Keep the water cold.' : OLD_PROMPT;
    server.prompts.set(session.id, prompt);
  }

  return {
    db: base.db,
    atc: server,
    kettle,
    urn,
    steward,
    delivery: { ...kettle, name: 'z-delivery', roles: ['orchestrator'] } satisfies FleetEntry,
    release: { ...kettle, name: 'z-ship', roles: ['release'] } satisfies FleetEntry,
    deliveryAgent: '0000aaaa-1111-4222-8333-444455556666',

    // A Claude Code transcript with a user turn and `compactions` compact boundaries.
    writeTranscript(agentSessionID: string, compactions: number) {
      const user = JSON.stringify({ type: 'user', message: { role: 'user', content: 'boil the kettle' }, timestamp: NOON_SYDNEY });
      const boundary = JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', timestamp: NOON_SYDNEY, compactMetadata: { trigger: 'auto' } });
      writeFileSync(`${base.dir}/projects/-work/${agentSessionID}.jsonl`, `${[user, ...Array.from({ length: compactions }, () => boundary)].join('\n')}\n`);
    },

    // The 5-minute timer at a time, then the watcher's flush.
    async tickAt(time: string, fleet: FleetEntry[]) {
      at(time);
      const peer = await AtcClient.open();
      onTestFinished(() => peer.close());
      await ensureFleet(base.db, makeFleetClient(peer), { dryRun: false, actor: 'hq-fleet', fleet });
      await flush(base.db);
    },
    async tick(minutes: number, fleet: FleetEntry[]) {
      await this.tickAt(new Date(Date.parse(NOON_SYDNEY) + minutes * 60_000).toISOString(), fleet);
    },
    outboxTo: (target: string) => base.db.query('SELECT target, text FROM outbox WHERE target = ? ORDER BY id').all(target) as { target: string; text: string }[],
    setState(id: string, state: string) {
      Object.assign(roster.find((s) => s.id === id) ?? {}, { state });
    },
    setId(id: string, next: string) {
      Object.assign(roster.find((s) => s.id === id) ?? {}, { id: next });
      server.prompts.set(next, OLD_PROMPT);
    },
    setRefresh: (value: unknown) => setMeta(base.db, 'fleet_refresh', JSON.stringify(value)),
    staleSince: () => staleSinceSchema.parse(JSON.parse(getMeta(base.db, 'fleet_stale_since') ?? '{}')),
    staleCommit: () => staleSinceSchema.parse(JSON.parse(getMeta(base.db, 'fleet_stale_since') ?? '{}'))['z-kettle']?.commit,
    outbox: () =>
      base.db.query('SELECT target, text FROM outbox ORDER BY id').all() as {
        target: string;
        text: string;
      }[],
    refresh: () => refreshSchema.parse(JSON.parse(getMeta(base.db, 'fleet_refresh') ?? '{}')),
  };
}

test('it restarts a session whose prompt has been stale for two hours, once, after it says saved', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [ctx.kettle]);
  await ctx.tick(131, [ctx.kettle]);
  await ctx.tick(136, [ctx.kettle]);

  expect(ctx.atc.sent).toHaveLength(1);
  expect(ctx.atc.calls.map((c) => c.method)).toStrictEqual(['session.kill', 'session.update', 'session.forget', 'session.spawn', 'session.update']);
  expect(ctx.atc.calls[0]?.input).toStrictEqual({ session: 'id-kettle', stopOnly: true });
  expect(ctx.atc.calls[1]?.input).toStrictEqual({ session: 'id-kettle', pinned: false });
  expect(ctx.atc.calls[2]?.input).toStrictEqual({ session: 'id-kettle', refusePinned: true });
  expect(ctx.atc.calls[3]?.input).toMatchObject({ name: 'z-kettle', prompt: NEW_PROMPT });
  expect(ctx.atc.calls[4]?.input).toStrictEqual({ session: 'spawned-1', pinned: true });
  expect(ctx.atc.prompts.get('spawned-1')).toBe(NEW_PROMPT);
  expect(ctx.refresh()).toStrictEqual({});
  expect(ctx.staleSince()).toStrictEqual({});
});

test('it names the session and the commit in the save request and the news', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.staleCommit()).toMatch(/^[0-9a-f]{7,40}$/u);
  expect(ctx.atc.sent[0]?.session).toBe('id-kettle');
  expect(ctx.atc.sent[0]?.text).toBe(
    `hq: z-kettle, your start prompt is stale: main has ${ctx.staleCommit()} (invented change), which your prompt predates. hq restarts you from main once you have saved your state. Save it now, then answer this message with the atc answer tool: \`saved\`, or \`busy\` to defer.`,
  );
  expect(ctx.db.query('SELECT text FROM news').all()).toStrictEqual([{ text: `z-kettle restarted from main; its old prompt predated ${ctx.staleCommit()}` }]);
});

test.each(['running', 'needs_you'])('it never asks a %s session', async (state) => {
  const ctx = setupTest({ sessions: [{ id: 'id-kettle', name: 'z-kettle', state }] });

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it never asks a session while a run of its own is deploying', async () => {
  const ctx = setupTest();
  ctx.db.run(
    `INSERT INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-901', 'Invented deploy', 'local', 'deploying', '2026-10-14T00:00:00Z', '2026-10-14T00:00:00Z')`,
  );
  ctx.db.run(`INSERT INTO run_sessions (session_id, issue, active, added_at) VALUES ('id-kettle', 'GEO-901', 1, '2026-10-14T00:00:00Z')`);

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.atc.sent).toStrictEqual([]);
});

test("it asks a session while another session's run is deploying", async () => {
  const ctx = setupTest();
  ctx.db.run(
    `INSERT INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-902', 'Invented deploy', 'local', 'deploy-held', '2026-10-14T00:00:00Z', '2026-10-14T00:00:00Z')`,
  );
  ctx.db.run(`INSERT INTO run_sessions (session_id, issue, active, added_at) VALUES ('id-other', 'GEO-902', 1, '2026-10-14T00:00:00Z')`);

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.atc.sent).toHaveLength(1);
});

test('it does not ask a session that was active under two minutes ago', async () => {
  const ctx = setupTest();
  ctx.atc.activity.set('id-kettle', Date.parse(NOON_SYDNEY) + 121 * 60_000 - 60_000);

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it does not ask a session with an unsent message waiting for it', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  enqueue(ctx.db, logEvent(ctx.db, 'hq', 'fleet', 'invented', 'z-test', null, null), 'z-kettle', 'invented note');
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.atc.sent.map((m) => m.text)).toStrictEqual(['invented note']);
});

test('it skips with a longer backoff each time a message stays delivered, up to four hours', async () => {
  const ctx = setupTest(),
    retries: (string | undefined)[] = [];

  for (const minutes of [0, 121, 132, 192, 203, 323, 334, 574, 585]) {
    await ctx.tick(minutes, [ctx.kettle]);
    retries.push(ctx.refresh()['z-kettle']?.retryAt);
  }

  expect(retries[2]).toBe(new Date(Date.parse(NOON_SYDNEY) + (132 + 60) * 60_000).toISOString().replace('.000Z', 'Z'));
  expect(retries[4]).toBe(new Date(Date.parse(NOON_SYDNEY) + (203 + 120) * 60_000).toISOString().replace('.000Z', 'Z'));
  expect(retries[6]).toBe(new Date(Date.parse(NOON_SYDNEY) + (334 + 240) * 60_000).toISOString().replace('.000Z', 'Z'));
  expect(retries[8]).toBe(new Date(Date.parse(NOON_SYDNEY) + (585 + 240) * 60_000).toISOString().replace('.000Z', 'Z'));
  expect(ctx.refresh()['z-kettle']?.skips).toBe(4);
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it tells the owner once after six skips and still does not restart', async () => {
  const ctx = setupTest(),
    quiet = overrideEnv('HQ_QUIET', '0-0');
  onTestFinished(quiet);

  for (const minutes of [0, 121, 132, 192, 203, 323, 334, 574, 585, 825, 836, 1076, 1087, 1327, 1338]) {
    await ctx.tick(minutes, [ctx.kettle]);
  }

  expect(ctx.outboxTo('z-stu')).toStrictEqual([{ target: 'z-stu', text: expect.stringMatching(/z-kettle.*deferred its restart 6 times/u) }]);
  expect(ctx.refresh()['z-kettle']?.reported).toBe(true);
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it skips the round when the session answers busy', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'busy' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'idle', skips: 1 });
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it never asks or restarts at 04:00 Sydney', async () => {
  const ctx = setupTest();

  await ctx.tick(-180, [ctx.kettle]);
  await ctx.tickAt(FOUR_AM_SYDNEY, [ctx.kettle]);

  expect(ctx.outbox()).toStrictEqual([]);
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it holds a restart that a session said saved for before 03:00 Sydney until quiet hours end', async () => {
  const ctx = setupTest(),
    quietCalls: string[] = [],
    quietPhases: (string | undefined)[] = [];

  await ctx.tick(760, [ctx.kettle]);
  await ctx.tick(881, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved', answeredAt: Date.parse(NOON_SYDNEY) + 882 * 60_000 });
  await ctx.tick(905, [ctx.kettle]);
  quietCalls.push(...ctx.atc.calls.map((c) => c.method));
  quietPhases.push(ctx.refresh()['z-kettle']?.phase);
  await ctx.tick(1145, [ctx.kettle]);

  expect(quietCalls).toStrictEqual([]);
  expect(quietPhases).toStrictEqual(['asked']);
  expect(ctx.atc.calls.map((c) => c.method)).toStrictEqual(['session.kill', 'session.update', 'session.forget', 'session.spawn', 'session.update']);
});

test('it never asks a session with the owner role', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-stu', name: 'z-stu', state: 'done' }] });

  await ctx.tick(0, [ctx.steward]);
  await ctx.tick(121, [ctx.steward]);

  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it never asks the session that runs the check', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'id-kettle'));

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it never restarts a session that said saved after it gained the owner role', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [{ ...ctx.kettle, roles: ['owner'] }]);

  expect(ctx.atc.calls).toStrictEqual([]);
  expect(ctx.refresh()).toStrictEqual({});
});

test('it never restarts a session that said saved when that session runs the check', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'id-kettle'));
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.atc.calls).toStrictEqual([]);
  expect(ctx.refresh()).toStrictEqual({});
});

test('it asks only one of two stale sessions in a tick', async () => {
  const ctx = setupTest({
    sessions: [
      { id: 'id-kettle', name: 'z-kettle', state: 'done' },
      { id: 'id-urn', name: 'z-urn', state: 'done' },
    ],
  });

  await ctx.tick(0, [ctx.kettle, ctx.urn]);
  await ctx.tick(121, [ctx.kettle, ctx.urn]);

  expect(ctx.atc.sent.map((m) => m.session)).toStrictEqual(['id-kettle']);
});

test('it asks the second stale session on the next tick', async () => {
  const ctx = setupTest({
    sessions: [
      { id: 'id-kettle', name: 'z-kettle', state: 'done' },
      { id: 'id-urn', name: 'z-urn', state: 'done' },
    ],
  });

  await ctx.tick(0, [ctx.kettle, ctx.urn]);
  await ctx.tick(121, [ctx.kettle, ctx.urn]);
  await ctx.tick(126, [ctx.kettle, ctx.urn]);

  expect(ctx.atc.sent.map((m) => m.session)).toStrictEqual(['id-kettle', 'id-urn']);
});

test('it restarts only one of two sessions that both said saved in a tick', async () => {
  const ctx = setupTest({
    sessions: [
      { id: 'id-kettle', name: 'z-kettle', state: 'done' },
      { id: 'id-urn', name: 'z-urn', state: 'done' },
    ],
  });

  await ctx.tick(0, [ctx.kettle, ctx.urn]);
  await ctx.tick(121, [ctx.kettle, ctx.urn]);
  await ctx.tick(126, [ctx.kettle, ctx.urn]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  ctx.atc.messages.set('m-2', { status: 'answered', answer: 'saved' });
  await ctx.tick(131, [ctx.kettle, ctx.urn]);

  expect(ctx.atc.calls.filter((c) => c.method === 'session.kill').map((c) => c.input)).toStrictEqual([{ session: 'id-kettle', stopOnly: true }]);
});

test('it still respawns and reports a restarted session when a later session check in the tick fails', async () => {
  const ctx = setupTest({
    sessions: [
      { id: 'id-kettle', name: 'z-kettle', state: 'done' },
      { id: 'id-urn', name: 'z-urn', state: 'done' },
    ],
  });

  await ctx.tick(0, [ctx.kettle, ctx.urn]);
  await ctx.tick(121, [ctx.kettle, ctx.urn]);
  await ctx.tick(126, [ctx.kettle, ctx.urn]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  ctx.atc.messages.set('m-2', { status: 'answered', answer: 'saved' });
  ctx.atc.getBudgets.set('id-urn', 1);
  await ctx.tick(131, [ctx.kettle, ctx.urn]);

  expect(ctx.atc.calls.filter((c) => c.method === 'session.spawn').map((c) => (c.input as { name: string }).name)).toStrictEqual(['z-kettle']);
  expect(ctx.db.query('SELECT text FROM news').all()).toStrictEqual([{ text: `z-kettle restarted from main; its old prompt predated ${ctx.staleCommit()}` }]);
  expect(ctx.db.query(`SELECT json_extract(data, '$.name') AS name, json_extract(data, '$.error') AS error FROM events WHERE action = 'stale-restart-failed'`).all()).toStrictEqual([
    { name: 'z-urn', error: 'invented session.get failure' },
  ]);
  expect(ctx.refresh()['z-urn']).toMatchObject({ phase: 'asked', skips: 0 });
});

test('it keeps a restart when another session skips earlier in the same tick', async () => {
  const ctx = setupTest({
    sessions: [
      { id: 'id-kettle', name: 'z-kettle', state: 'done' },
      { id: 'id-urn', name: 'z-urn', state: 'done' },
    ],
  });

  await ctx.tick(0, [ctx.urn, ctx.kettle]);
  await ctx.tick(121, [ctx.urn, ctx.kettle]);
  await ctx.tick(126, [ctx.urn, ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'busy' });
  ctx.atc.messages.set('m-2', { status: 'answered', answer: 'saved' });
  await ctx.tick(131, [ctx.urn, ctx.kettle]);

  expect(ctx.atc.calls.filter((c) => c.method === 'session.spawn').map((c) => (c.input as { name: string }).name)).toStrictEqual(['z-kettle']);
  expect(ctx.refresh()).toStrictEqual({ 'z-urn': { sessionId: 'id-urn', phase: 'idle', skips: 1, retryAt: new Date(Date.parse(NOON_SYDNEY) + (131 + 60) * 60_000).toISOString().replace('.000Z', 'Z') } });
});

test('it pins the session again and spawns nothing when atc refuses the forget as pinned', async () => {
  const ctx = setupTest();
  ctx.atc.forgetRefusals.add('id-kettle');

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.atc.calls.map((c) => [c.method, (c.input as { pinned?: boolean }).pinned])).toStrictEqual([
    ['session.kill', undefined],
    ['session.update', false],
    ['session.forget', undefined],
    ['session.update', true],
  ]);
  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'idle', skips: 1 });
});

test('it reports both failures when the forget fails and the pin after it fails too', async () => {
  const ctx = setupTest();
  ctx.atc.forgetRefusals.add('id-kettle');
  ctx.atc.pinFailures.add('id-kettle');

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.db.query(`SELECT json_extract(data, '$.error') AS error FROM events WHERE action = 'stale-restart-failed'`).all()).toStrictEqual([
    { error: 'forget id-kettl failed (id-kettle is pinned); pinning it again failed too (invented pin failure), so it is stopped and unpinned' },
  ]);
  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'idle', skips: 1 });
});

test('it counts a confirmToken answer to the forget as a failure and never sends the token back', async () => {
  const ctx = setupTest();
  ctx.atc.forgetTokens.add('id-kettle');

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.atc.calls.filter((c) => c.method === 'session.forget')).toHaveLength(1);
  expect(ctx.atc.calls.at(-1)?.input).toStrictEqual({ session: 'id-kettle', pinned: true });
  expect(ctx.atc.calls.some((c) => c.method === 'session.spawn')).toBe(false);
});

test('it tells the owner when the spawn fails after the forget', async () => {
  const ctx = setupTest({ cwd: '/nonexistent/invented' });

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.outboxTo('z-stu')).toContainEqual({ target: 'z-stu', text: expect.stringContaining('not spawned again') });
  expect(ctx.refresh()).toStrictEqual({});
});

test('it skips the round when atc reports the message unanswered', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'unanswered' });
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'idle', skips: 1 });
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it logs a failed message lookup and keeps the save request open past the timeout without a skip', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messageFailures.add('m-1');
  await ctx.tick(126, [ctx.kettle]);
  await ctx.tick(136, [ctx.kettle]);

  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'asked', skips: 0 });
  expect(ctx.db.query(`SELECT json_extract(data, '$.message') AS message, json_extract(data, '$.error') AS error FROM events WHERE action = 'stale-answer-unread'`).all()).toStrictEqual([
    { message: 'm-1', error: 'invented message.get failure' },
    { message: 'm-1', error: 'invented message.get failure' },
  ]);
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it waits, then restarts, when the activity of the saved answer itself is recent', async () => {
  const answeredAt = Date.parse(NOON_SYDNEY) + 125 * 60_000,
    ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved', answeredAt });
  ctx.atc.activity.set('id-kettle', answeredAt);
  await ctx.tick(126, [ctx.kettle]);

  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'asked', skips: 0 });
  expect(ctx.atc.calls).toStrictEqual([]);

  await ctx.tick(128, [ctx.kettle]);

  expect(ctx.atc.calls.map((c) => c.method)).toContain('session.forget');
  expect(ctx.refresh()).toStrictEqual({});
});

test('it skips the round when the session is still busy ten minutes after it said saved', async () => {
  const answeredAt = Date.parse(NOON_SYDNEY) + 125 * 60_000,
    ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved', answeredAt });
  ctx.atc.activity.set('id-kettle', answeredAt);
  ctx.setState('id-kettle', 'running');
  await ctx.tick(126, [ctx.kettle]);
  await ctx.tick(136, [ctx.kettle]);

  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'idle', skips: 1 });
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it never records a session whose prompt reads unknown as stale', async () => {
  const ctx = setupTest();
  ctx.atc.prompts.clear();

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.staleSince()).toStrictEqual({});
  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it starts the stale clock again when the session id changes', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  ctx.setId('id-kettle', 'id-kettle-2');
  await ctx.tick(121, [ctx.kettle]);

  expect(ctx.staleSince()['z-kettle']).toMatchObject({ sessionId: 'id-kettle-2', at: new Date(Date.parse(NOON_SYDNEY) + 121 * 60_000).toISOString().replace('.000Z', 'Z') });
  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it starts a fresh two-hour wait when a prompt reads current and then stale again under the same session id', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  ctx.atc.prompts.set('id-kettle', NEW_PROMPT);
  await ctx.tick(30, [ctx.kettle]);
  ctx.atc.prompts.set('id-kettle', OLD_PROMPT);
  await ctx.tick(35, [ctx.kettle]);
  await ctx.tick(125, [ctx.kettle]);

  expect(ctx.staleSince()['z-kettle']).toMatchObject({ sessionId: 'id-kettle', at: new Date(Date.parse(NOON_SYDNEY) + 35 * 60_000).toISOString().replace('.000Z', 'Z') });
  expect(ctx.atc.sent).toStrictEqual([]);
});

test('it turns a restart an earlier pass left unfinished into a skip when the session is still there', async () => {
  const ctx = setupTest();

  await ctx.tick(0, [ctx.kettle]);
  ctx.setRefresh({ 'z-kettle': { sessionId: 'id-kettle', phase: 'restarting', skips: 0 } });
  await ctx.tick(5, [ctx.kettle]);

  expect(ctx.refresh()['z-kettle']).toMatchObject({ phase: 'idle', skips: 1 });
  expect(ctx.atc.calls).toStrictEqual([]);
});

test('it never restarts a session whose prompt hq-private cannot supply', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_PRIVATE_DIR', `${ctx.kettle.cwd}/missing-private`));

  await ctx.tick(0, [ctx.kettle]);
  await ctx.tick(121, [ctx.kettle]);
  await ctx.tick(131, [ctx.kettle]);

  expect(ctx.atc.sent).toStrictEqual([]);
  expect(ctx.atc.calls.map((call) => call.method)).not.toContain('session.kill');
  expect(ctx.staleSince()).toStrictEqual({});
});

test('it restarts an orchestrator session six hours after its start, through the save request', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-delivery', name: 'z-delivery', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 6 * 3_600_000 }] });
  ctx.atc.prompts.set('id-delivery', NEW_PROMPT);

  await ctx.tick(0, [ctx.delivery]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(5, [ctx.delivery]);

  expect(ctx.atc.sent.map((message) => [message.session, message.text])).toStrictEqual([
    [
      'id-delivery',
      'hq: z-delivery, your scheduled restart is due (6 h since start). hq restarts you from main once you have saved your state. Save it now, then answer this message with the atc answer tool: `saved`, or `busy` to defer.',
    ],
  ]);
  expect(ctx.atc.calls.map((call) => call.method)).toStrictEqual(['session.kill', 'session.update', 'session.forget', 'session.spawn', 'session.update']);
  expect(ctx.db.query(`SELECT action, data FROM events WHERE action IN ('save-requested', 'scheduled-restarted') ORDER BY seq`).all()).toStrictEqual([
    { action: 'save-requested', data: JSON.stringify({ name: 'z-delivery', sessionId: 'id-delivery', reason: '6 h since start' }) },
    { action: 'scheduled-restarted', data: JSON.stringify({ name: 'z-delivery', sessionId: 'id-delivery', reason: '6 h since start' }) },
  ]);
  expect(ctx.db.query('SELECT text FROM news').all()).toStrictEqual([{ text: 'z-delivery restarted from main; scheduled restart, 6 h since start' }]);
});

test('it restarts an orchestrator session one hour old after three compactions since its start', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-delivery', name: 'z-delivery', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 1 * 3_600_000, agentSessionID: '0000aaaa-1111-4222-8333-444455556666' }] });
  ctx.atc.prompts.set('id-delivery', NEW_PROMPT);
  ctx.writeTranscript(ctx.deliveryAgent, 3);

  await ctx.tick(0, [ctx.delivery]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(5, [ctx.delivery]);

  expect(ctx.atc.sent.map((message) => message.text)).toStrictEqual([expect.stringContaining('your scheduled restart is due (3 compactions since start)')]);
  expect(ctx.db.query(`SELECT json_extract(data, '$.reason') AS reason FROM events WHERE action = 'scheduled-restarted'`).all()).toStrictEqual([{ reason: '3 compactions since start' }]);
  expect(ctx.atc.calls.filter((call) => call.method === 'session.spawn')).toMatchObject([{ input: { name: 'z-delivery' } }]);
});

test('it leaves an orchestrator session alone at five hours and two compactions', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-delivery', name: 'z-delivery', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 5 * 3_600_000, agentSessionID: '0000aaaa-1111-4222-8333-444455556666' }] });
  ctx.atc.prompts.set('id-delivery', NEW_PROMPT);
  ctx.writeTranscript(ctx.deliveryAgent, 2);

  await ctx.tick(0, [ctx.delivery]);
  await ctx.tick(55, [ctx.delivery]);

  expect(ctx.atc.sent).toStrictEqual([]);
  expect(ctx.refresh()).toStrictEqual({});
});

test('it restarts a release session on the same schedule', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-ship', name: 'z-ship', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 6 * 3_600_000 }] });
  ctx.atc.prompts.set('id-ship', NEW_PROMPT);

  await ctx.tick(0, [ctx.release]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(5, [ctx.release]);

  expect(ctx.db.query(`SELECT json_extract(data, '$.name') AS name, json_extract(data, '$.reason') AS reason FROM events WHERE action = 'scheduled-restarted'`).all()).toStrictEqual([
    { name: 'z-ship', reason: '6 h since start' },
  ]);
});

test('it never schedules a restart for a session of another role, or of none', async () => {
  const ctx = setupTest({
    sessions: [
      { id: 'id-kettle', name: 'z-kettle', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 7 * 3_600_000, agentSessionID: '0000aaaa-1111-4222-8333-444455556666' },
      { id: 'id-dev', name: 'z-dev', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 7 * 3_600_000 },
    ],
  });
  ctx.atc.prompts.set('id-kettle', NEW_PROMPT);
  ctx.atc.prompts.set('id-dev', NEW_PROMPT);
  ctx.writeTranscript(ctx.deliveryAgent, 4);

  await ctx.tick(0, [ctx.kettle, { ...ctx.kettle, name: 'z-dev', roles: ['developer'] }]);

  expect(ctx.atc.sent).toStrictEqual([]);
  expect(ctx.refresh()).toStrictEqual({});
});

test('it does not restart the new session again while it is younger than the limits', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-delivery', name: 'z-delivery', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 6 * 3_600_000, agentSessionID: '0000aaaa-1111-4222-8333-444455556666' }] });
  ctx.atc.prompts.set('id-delivery', NEW_PROMPT);
  ctx.writeTranscript(ctx.deliveryAgent, 3);

  await ctx.tick(0, [ctx.delivery]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(5, [ctx.delivery]);
  for (const minutes of [10, 120, 300, 360]) {
    await ctx.tick(minutes, [ctx.delivery]);
  }

  expect(ctx.atc.sent).toHaveLength(1);
  expect(ctx.atc.calls.filter((call) => call.method === 'session.kill')).toHaveLength(1);
  expect(ctx.refresh()).toStrictEqual({});
});

test('it asks again six hours after the new session started', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-delivery', name: 'z-delivery', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 6 * 3_600_000 }] });
  ctx.atc.prompts.set('id-delivery', NEW_PROMPT);

  await ctx.tick(0, [ctx.delivery]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'saved' });
  await ctx.tick(5, [ctx.delivery]);
  await ctx.tick(10, [ctx.delivery]);
  await ctx.tick(371, [ctx.delivery]);

  expect(ctx.atc.sent.map((message) => message.session)).toStrictEqual(['id-delivery', 'spawned-1']);
});

test('it keeps a deferred scheduled restart waiting out its backoff though the prompt reads current', async () => {
  const ctx = setupTest({ sessions: [{ id: 'id-delivery', name: 'z-delivery', state: 'done', createdAt: Date.parse(NOON_SYDNEY) - 6 * 3_600_000 }] });
  ctx.atc.prompts.set('id-delivery', NEW_PROMPT);

  await ctx.tick(0, [ctx.delivery]);
  ctx.atc.messages.set('m-1', { status: 'answered', answer: 'busy' });
  await ctx.tick(5, [ctx.delivery]);
  await ctx.tick(30, [ctx.delivery]);

  expect(ctx.atc.sent).toHaveLength(1);
  expect(ctx.refresh()['z-delivery']).toMatchObject({ phase: 'idle', skips: 1, scheduled: '6 h since start' });
});
