import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../../test/helpers.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { addRun } from './add-run.ts';
import { FROM_START } from './from-start.ts';
import { ingestNotes } from './ingest-notes.ts';
import { sendNoteToOrchestrator } from './send-note-to-orchestrator.ts';
import { setState } from './set-state.ts';

// A database, and a fake atc with an empty feed that knows the kettle session.
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
  const rewind = () => fresh.db.query("UPDATE meta SET value = ? WHERE key = 'atc_events_cursor'").run(FROM_START);
  const outbox = () => fresh.db.query('SELECT target, text FROM outbox ORDER BY id').all();
  return { db: fresh.db, kettle, feed: stub.feed, tick, rewind, outbox };
}

test('a decision note reaches the orchestrator once across two ticks that both read it', async () => {
  const app = setupTest();
  addRun(app.db, { issue: 'GEO-9832', title: 'Invented kettle work', place: 'local', session: app.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  app.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  app.feed.push({ at: Date.parse(NOON_SYDNEY), session: app.kettle, name: 'kettle', kind: 'note', detail: 'descale with vinegar, not citric acid', label: 'decision' });

  await app.tick();
  app.rewind();
  await app.tick();

  expect(app.outbox()).toStrictEqual([{ target: 'z-delivery', text: 'decision from GEO-9832 (kettle): descale with vinegar, not citric acid' }]);
});

test('a blocked note from a session with no run names no issue', async () => {
  const app = setupTest();
  app.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  app.feed.push({ at: Date.parse(NOON_SYDNEY), session: '00000033-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'widget', kind: 'note', detail: 'the widget press has no power', label: 'blocked' });

  await app.tick();

  expect(app.outbox()).toStrictEqual([{ target: 'z-delivery', text: 'blocked from (no run) (widget): the widget press has no power' }]);
});

test('a progress note is not routed', async () => {
  const app = setupTest();
  addRun(app.db, { issue: 'GEO-9832', title: 'Invented kettle work', place: 'local', session: app.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  app.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  app.feed.push({ at: Date.parse(NOON_SYDNEY), session: app.kettle, name: 'kettle', kind: 'note', detail: 'filled the kettle', label: 'progress' });

  await app.tick();

  expect(app.outbox()).toStrictEqual([]);
});

test('two decision notes at the same time each reach the orchestrator once across two ticks', async () => {
  const app = setupTest();
  addRun(app.db, { issue: 'GEO-9832', title: 'Invented kettle work', place: 'local', session: app.kettle, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  app.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  const at = Date.parse(NOON_SYDNEY);
  app.feed.push(
    { at, session: app.kettle, name: 'kettle', kind: 'note', detail: 'descale with vinegar', label: 'decision' },
    { at, session: app.kettle, name: 'kettle', kind: 'note', detail: 'keep the old lid', label: 'decision' },
  );

  await app.tick();
  app.rewind();
  await app.tick();

  expect(app.outbox()).toStrictEqual([
    { target: 'z-delivery', text: 'decision from GEO-9832 (kettle): descale with vinegar' },
    { target: 'z-delivery', text: 'decision from GEO-9832 (kettle): keep the old lid' },
  ]);
});

test('a decision note goes to the target the caller names', () => {
  const app = setupTest();

  const sent = sendNoteToOrchestrator(app.db, { at: Date.parse(NOON_SYDNEY), session: app.kettle, name: 'kettle', kind: 'note', detail: 'buy a new kettle', label: 'decision', cursor: 'kettle-1' }, 'teapot-lead');

  expect([sent, app.outbox()]).toStrictEqual([true, [{ target: 'teapot-lead', text: 'decision from (no run) (kettle): buy a new kettle' }]]);
});

test('a blocked note from the design pass session names the design pass, not the build run', async () => {
  const app = setupTest();
  addRun(app.db, { issue: 'GEO-9833', title: 'Design the kettle spout', place: 'local', session: app.kettle, next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(app.db, 'GEO-9833', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(app.db, { issue: 'GEO-9833', title: 'Build the kettle spout', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  app.db.query("INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)").run(FROM_START);
  app.feed.push({ at: Date.parse(NOON_SYDNEY), session: app.kettle, name: 'kettle', kind: 'note', detail: 'waiting on a spout sketch review', label: 'blocked' });

  await app.tick();

  expect(app.outbox()).toStrictEqual([{ target: 'z-delivery', text: "blocked from GEO-9833's design pass (kettle): waiting on a spout sketch review" }]);
});
