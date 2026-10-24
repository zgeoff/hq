import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { getMeta } from '../../db/get-meta.ts';
import { setMeta } from '../../db/set-meta.ts';
import { runLanesCapCommand } from './run-lanes-cap-command.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1', 'z-delivery': 'kettle-2' }));
  const owner = { openClient: () => Promise.resolve({ peerSession: 'kettle-1', close: () => {} }) };
  const delivery = { openClient: () => Promise.resolve({ peerSession: 'kettle-2', close: () => {} }) };
  const stranger = { openClient: () => Promise.resolve({ peerSession: 'kettle-9', close: () => {} }) };
  return { db: fresh.db, owner, delivery, stranger };
}

test('it shows no cap and the working count when none is set', async () => {
  const ctx = setupTest();

  const out = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'show' }, probe: ctx.stranger });

  expect(out.text).toBe('no cap, 0 working (counted by run: the atc reading is stale)');
  expect(out.data).toStrictEqual({ cap: null, working: 0, workingFrom: 'runs', error: null });
});

test('it sets a cap from the owner, files an event and news, and shows it', async () => {
  const ctx = setupTest();

  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 7, until: 'Mon 08:00', reason: 'weekend pacing' }, probe: ctx.owner });
  const shown = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'show' }, probe: ctx.stranger });

  expect(shown.text).toBe('cap: 7 until Mon 08:00 Sydney (weekend pacing), 0 working (counted by run: the atc reading is stale)');
  expect(ctx.db.query("SELECT action, actor, from_state, to_state FROM events WHERE subject_id = 'lanes'").all()).toStrictEqual([{ action: 'cap-set', actor: 'z-stu', from_state: 'none', to_state: 'set' }]);
  expect(ctx.db.query('SELECT from_name, text FROM news').all()).toStrictEqual([{ from_name: 'z-stu', text: 'z-stu capped working delivery sessions at 7 until Mon 08:00 Sydney (weekend pacing)' }]);
});

test('it lifts a cap from the owner, files an event and news, and shows no cap', async () => {
  const ctx = setupTest();
  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 7, until: null, reason: null }, probe: ctx.owner });

  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'off', reason: 'the quota is back' }, probe: ctx.owner });

  expect(getMeta(ctx.db, 'lanes_cap')).toBeNull();
  expect(ctx.db.query("SELECT action FROM events WHERE subject_id = 'lanes' ORDER BY seq").all()).toStrictEqual([{ action: 'cap-set' }, { action: 'cap-off' }]);
  expect(ctx.db.query('SELECT text FROM news ORDER BY id DESC LIMIT 1').get()).toStrictEqual({ text: 'z-stu lifted the lanes cap of 7 (the quota is back)' });
});

test('it says there is no cap to lift, and files nothing', async () => {
  const ctx = setupTest();

  const out = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'off', reason: null }, probe: ctx.owner });

  expect(out.text).toBe('There is no cap to lift.');
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE subject_id = 'lanes'").get()).toStrictEqual({ total: 0 });
});

test('it lets the owner raise a cap', async () => {
  const ctx = setupTest();
  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 7, until: null, reason: null }, probe: ctx.owner });

  const out = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 12, until: null, reason: null }, probe: ctx.owner });

  expect(out.data).toMatchObject({ cap: { cap: 12, by: 'z-stu' } });
});

test('it lets the delivery lead set a cap where none exists, recorded under its name', async () => {
  const ctx = setupTest();

  const out = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 4, until: null, reason: 'quota' }, probe: ctx.delivery });

  expect(out.data).toMatchObject({ cap: { cap: 4, by: 'z-delivery', reason: 'quota' } });
});

test('it lets the delivery lead lower a cap and keeps the until it does not replace', async () => {
  const ctx = setupTest();
  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 7, until: '2026-10-20T00:00:00Z', reason: 'weekend pacing' }, probe: ctx.owner });

  const out = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 5, until: null, reason: null }, probe: ctx.delivery });

  expect(out.data).toMatchObject({ cap: { cap: 5, until: '2026-10-20T00:00:00Z', reason: 'weekend pacing', by: 'z-delivery' } });
});

test('it refuses the delivery lead raising a cap and leaves it as it was', async () => {
  const ctx = setupTest();
  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 7, until: null, reason: null }, probe: ctx.owner });
  const before = getMeta(ctx.db, 'lanes_cap');

  const refused = runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 9, until: null, reason: null }, probe: ctx.delivery });

  expect(refused).rejects.toMatchObject({ code: 'not_allowed' });
  expect(getMeta(ctx.db, 'lanes_cap')).toBe(before);
});

test('it refuses the delivery lead lifting a cap', async () => {
  const ctx = setupTest();
  await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 7, until: null, reason: null }, probe: ctx.owner });

  const refused = runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'off', reason: null }, probe: ctx.delivery });

  expect(refused).rejects.toMatchObject({ code: 'not_allowed' });
});

test('it refuses a caller that is neither the owner nor the delivery lead', () => {
  const ctx = setupTest();

  const refused = runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 4, until: null, reason: null }, probe: ctx.stranger });

  expect(refused).rejects.toThrow('only z-stu may change the lanes cap');
  expect(getMeta(ctx.db, 'lanes_cap')).toBeNull();
});

test('it refuses a caller atc places in no session', () => {
  const ctx = setupTest();

  const refused = runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 4, until: null, reason: null }, probe: { openClient: () => Promise.resolve({ peerSession: null, close: () => {} }) } });

  expect(refused).rejects.toMatchObject({ code: 'not_allowed' });
});

test('it refuses every change while atc cannot be reached', () => {
  const ctx = setupTest();

  const refused = runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 4, until: null, reason: null }, probe: { openClient: () => Promise.reject(new Error('connect ENOENT atc.sock')) } });

  expect(refused).rejects.toThrow('connect ENOENT atc.sock');
  expect(getMeta(ctx.db, 'lanes_cap')).toBeNull();
});

test('it refuses an until in the past', () => {
  const ctx = setupTest();

  const refused = runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 4, until: '2026-10-14T00:00:00Z', reason: null }, probe: ctx.owner });

  expect(refused).rejects.toThrow('has passed');
});

test('it reports a malformed stored cap, applies none, and lets the owner replace it', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'lanes_cap', '{"cap":"many"}');

  const shown = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'show' }, probe: ctx.stranger });
  const set = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'set', cap: 3, until: null, reason: null }, probe: ctx.owner });

  expect(shown.text).toStartWith('no cap, 0 working');
  expect(shown.text).toInclude("the stored cap is unusable, so no cap applies: meta 'lanes_cap' is malformed at cap");
  expect(set.data).toMatchObject({ cap: { cap: 3 } });
});

test('it reports a stored cap that is not JSON', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'lanes_cap', 'seven');

  const shown = await runLanesCapCommand({ db: ctx.db, at: new Date('2026-10-15T00:00:00Z'), args: { kind: 'show' }, probe: ctx.stranger });

  expect(shown.data).toMatchObject({ error: "meta 'lanes_cap' is not valid JSON" });
});
