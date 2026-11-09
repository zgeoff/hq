import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { addRun } from './add-run.ts';
import { FROM_START } from './from-start.ts';
import { ingestNotes } from './ingest-notes.ts';
import { sendNoteToOrchestrator } from './send-note-to-orchestrator.ts';
import { setState } from './set-state.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const kettle = '00000032-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const fresh = freshDb();
  const stub = fakeAtc(fresh.dir, [{ id: kettle, name: 'kettle', alive: true, state: 'running' }]);
  onTestFinished(() => {
    stub.stop();
    fresh.cleanup();
  });
  const tick = async () => {
    const client = await AtcClient.open();
    try {
      await ingestNotes(fresh.db, client, { run: buildStubFinalGH({ commits: [] }, []) });
    } finally {
      client.close();
    }
  };
  const outbox = () => fresh.db.query('SELECT target, text FROM outbox ORDER BY id').all();
  return { db: fresh.db, kettle, feed: stub.feed, tick, outbox, seed: buildSeeder(fresh) };
}

test('a decision note reaches the orchestrator once across two ticks that both read it', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9832', title: 'Invented kettle work', place: 'local', session: ctx.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  ctx.feed.push({ at: Date.parse(NOON_SYDNEY), session: ctx.kettle, name: 'kettle', kind: 'note', detail: 'descale with vinegar, not citric acid', label: 'decision' });

  await ctx.tick();
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  await ctx.tick();

  expect(ctx.outbox()).toStrictEqual([{ target: 'z-delivery', text: 'decision from GEO-9832 (kettle): descale with vinegar, not citric acid' }]);
});

test('a blocked note from a session with no run names no issue', async () => {
  const ctx = setupTest();
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  ctx.feed.push({ at: Date.parse(NOON_SYDNEY), session: '00000033-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'widget', kind: 'note', detail: 'the widget press has no power', label: 'blocked' });

  await ctx.tick();

  expect(ctx.outbox()).toStrictEqual([{ target: 'z-delivery', text: 'blocked from (no run) (widget): the widget press has no power' }]);
});

test('a progress note is not routed', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9832', title: 'Invented kettle work', place: 'local', session: ctx.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  ctx.feed.push({ at: Date.parse(NOON_SYDNEY), session: ctx.kettle, name: 'kettle', kind: 'note', detail: 'filled the kettle', label: 'progress' });

  await ctx.tick();

  expect(ctx.outbox()).toStrictEqual([]);
});

test('two decision notes at the same time each reach the orchestrator once across two ticks', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9832', title: 'Invented kettle work', place: 'local', session: ctx.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  const at = Date.parse(NOON_SYDNEY);
  ctx.feed.push(
    { at, session: ctx.kettle, name: 'kettle', kind: 'note', detail: 'descale with vinegar', label: 'decision' },
    { at, session: ctx.kettle, name: 'kettle', kind: 'note', detail: 'keep the old lid', label: 'decision' },
  );

  await ctx.tick();
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  await ctx.tick();

  expect(ctx.outbox()).toStrictEqual([
    { target: 'z-delivery', text: 'decision from GEO-9832 (kettle): descale with vinegar' },
    { target: 'z-delivery', text: 'decision from GEO-9832 (kettle): keep the old lid' },
  ]);
});

test('a decision note goes to the target the caller names', () => {
  const ctx = setupTest();

  const sent = sendNoteToOrchestrator(ctx.db, { at: Date.parse(NOON_SYDNEY), session: ctx.kettle, name: 'kettle', kind: 'note', detail: 'buy a new kettle', label: 'decision', cursor: 'kettle-1' }, 'teapot-lead');

  expect([sent, ctx.outbox()]).toStrictEqual([true, [{ target: 'teapot-lead', text: 'decision from (no run) (kettle): buy a new kettle' }]]);
});

test('a blocked note from the design pass session names the design pass, not the build run', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9833', title: 'Design the kettle spout', place: 'local', session: ctx.kettle, next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9833', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9833', title: 'Build the kettle spout', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  ctx.seed.meta({ key: 'atc_events_cursor', value: FROM_START });
  ctx.feed.push({ at: Date.parse(NOON_SYDNEY), session: ctx.kettle, name: 'kettle', kind: 'note', detail: 'waiting on a spout sketch review', label: 'blocked' });

  await ctx.tick();

  expect(ctx.outbox()).toStrictEqual([{ target: 'z-delivery', text: "blocked from GEO-9833's design pass (kettle): waiting on a spout sketch review" }]);
});
