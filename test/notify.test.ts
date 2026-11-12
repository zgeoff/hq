// oxlint-disable zgeoff/test-beside-module -- the whole-program notify suite, from a queued row through flush and send to a stub atc
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { toExactOptional } from '@zgeoff/std';
import invariant from 'tiny-invariant';
import { addAsk } from '../src/asks/add-ask.ts';
import { laterAsk } from '../src/asks/later-ask.ts';
import { socketPath } from '../src/atc/socket-path.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { enqueue } from '../src/outbox/enqueue.ts';
import { flush } from '../src/outbox/flush.ts';
import { readOutboxRows } from '../src/outbox/read-outbox-rows.ts';
import { setForward } from '../src/outbox/set-forward.ts';
import { logEvent } from '../src/log-event.ts';
import { main } from '../src/cli.ts';
import { send } from '../src/send/send.ts';
import type { RunOpts, Runner } from '../src/runner/types.ts';
import type { FakeAtcSession } from './helpers.ts';
import { NOON_SYDNEY, at, fakeAtc, requireEnv } from './helpers.ts';
import { markOutboxFailed } from '../src/outbox/mark-outbox-failed.ts';
import { markOutboxSent } from '../src/outbox/mark-outbox-sent.ts';
import { unsent } from '../src/outbox/unsent.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';
import { createTestDb } from './create-test-db.ts';

test('#flush sends a pending message to the session by name, once', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  const first = await flush(ctx.db);
  expect(first).toMatchObject({ sent: 1, failed: 0 });
  expect(atc.sent).toStrictEqual([{ session: 'id-stu', text: expect.stringContaining('proposal ready: tidy-docs'), from: 'hq', idempotencyKey: expect.stringMatching(/^hq-ev\d+-stu$/u), notice: false }]);
  const again = await flush(ctx.db, { retryFailed: true });
  expect(again).toMatchObject({ sent: 0 });
  expect(atc.sent).toHaveLength(1);
});

test('#flush keeps a message for a retry when the daemon is dead, and the retry reuses its key', async () => {
  const ctx = setupTest();
  updateEnv('HQ_ATC_SOCKET', `${ctx.directory}/nobody-home.sock`);
  ctx.fileProposal('tidy-docs');
  const failed = await flush(ctx.db);
  expect(failed.failed).toBe(1);
  const [row] = readOutboxRows(ctx.db);
  invariant(row, 'the failed flush left its row');
  expect(row.status).toBe('failed');
  const atc = ctx.startAtc();
  const held = await flush(ctx.db);
  expect(held).toMatchObject({ sent: 0 });
  const retried = await flush(ctx.db, { retryFailed: true });
  expect(retried).toMatchObject({ sent: 1 });
  expect(atc.sent[0]?.idempotencyKey).toBe(row.idem_key);
});

test('it leaves a row sent when another flush sent it while this one failed to reach atc', async () => {
  const ctx = setupTest();
  updateEnv('HQ_ATC_SOCKET', `${ctx.directory}/nobody-home.sock`);
  ctx.fileProposal('tidy-docs');
  const pending = flush(ctx.db);
  for (const row of unsent(ctx.db, true, undefined)) {
    markOutboxSent(ctx.db, row, null);
  }
  const result = await pending;
  expect(result).toMatchObject({ failed: 0, errors: [] });
  expect(ctx.db.query('SELECT status, attempts, last_error FROM outbox').all()).toStrictEqual([{ status: 'sent', attempts: 1, last_error: null }]);
});

test('#flush reaches a fleet session renamed under hq by the id hq fleet recorded', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([
    { id: 'id-stu', name: 'stu-renamed', alive: true, state: 'done' },
    { id: 'id-other', name: 'stu', alive: true, state: 'done' },
  ]);
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'stu': 'id-stu' }));
  ctx.fileProposal('tidy-docs');
  const result = await flush(ctx.db);
  expect(result).toMatchObject({ sent: 1, failed: 0 });
  expect(atc.sent[0]?.session).toBe('id-stu');
});

test("#flush falls back to the name when the recorded id's session is gone", async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([
    { id: 'id-old', name: 'stu-renamed', alive: false, state: 'exited' },
    { id: 'id-new', name: 'stu', alive: true, state: 'done' },
  ]);
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'stu': 'id-old' }));
  ctx.fileProposal('tidy-docs');
  const result = await flush(ctx.db);
  expect(result).toMatchObject({ sent: 1 });
  expect(atc.sent[0]?.session).toBe('id-new');
});

test('#flush fails only that message for an unknown or ambiguous session name', async () => {
  const ctx = setupTest();
  ctx.startAtc([
    { id: 'a', name: 'stu', alive: true, state: 'done' },
    { id: 'b', name: 'stu', alive: true, state: 'done' },
  ]);
  ctx.fileProposal('tidy-docs');
  const result = await flush(ctx.db);
  expect(result.failed).toBe(1);
  expect(result.errors[0]).toContain('2 live sessions are named stu');
});

test('#flush leaves messages pending when HQ_NOTIFY is off', async () => {
  const ctx = setupTest();
  updateEnv('HQ_NOTIFY', 'off');
  ctx.fileProposal('tidy-docs');
  const result = await flush(ctx.db);
  expect(result.skipped).toBe(true);
  expect(readOutboxRows(ctx.db)[0]?.status).toBe('pending');
});

test('#flush drops a ready notice for an item that left the queue before sending', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  laterAsk(ctx.db, 'tidy-docs', 'proposal', null, 'z-steward');
  const result = await flush(ctx.db);
  expect(result).toMatchObject({ sent: 0, dropped: 1 });
  expect(atc.sent).toHaveLength(0);
});

test('#send hands the send to a detached unit and sends nothing itself inside an atc session', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  const atc = ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  const unit = ctx.buildUnitRunner(0);
  const result = await send(ctx.db, 'all', false, unit.run, 0);
  expect(result.detached?.unit).toMatch(/^hq-send-/u);
  expect(result.flushed).toMatchObject({ sent: 0, pending: 1 });
  expect(atc.sent).toHaveLength(0);
  expect(unit.calls[0]?.cmd.slice(0, 2)).toStrictEqual(['systemd-run', '--user']);
  expect(unit.calls[0]?.cmd.slice(-2)).toStrictEqual(['outbox', 'flush']);
  expect(unit.calls[0]?.cmd.findLast((arg) => arg.startsWith('--setenv=HQ_DB='))).toBe(`--setenv=HQ_DB=${process.env['HQ_DB']}`);
  expect(unit.calls[0]?.cmd).toContain('--setenv=ATC_SESSION_ID=');
  expect(unit.calls[0]?.opts?.env?.['ATC_SESSION_ID']).toBeUndefined();
  expect(readOutboxRows(ctx.db)[0]?.status).toBe('pending');
});

test('#send sends inline inside an atc session when the unit cannot start', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  const result = await send(ctx.db, 'all', false, ctx.buildUnitRunner(1).run);
  expect(result.detached?.error).toBe('no user manager');
  expect(result.flushed).toMatchObject({ sent: 1 });
});

test('#send sends inline inside an atc session when systemd-run is missing, and pins a relative HQ_DB', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  const absolute = requireEnv('HQ_DB');
  ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  const inline = await send(ctx.db, 'all', false, () => Promise.reject(new Error('ENOENT: posix_spawn systemd-run')));
  expect(inline).toMatchObject({ flushed: { sent: 1 } });
  const unit = ctx.buildUnitRunner(0);
  const cwd = process.cwd();
  process.chdir(ctx.directory);
  onTestFinished(() => process.chdir(cwd));
  updateEnv('HQ_DB', absolute.slice(ctx.directory.length + 1));
  ctx.fileProposal('tidy-docs-2');
  await send(ctx.db, 'all', false, unit.run, 0);
  expect(unit.calls[0]?.cmd).toContain(`--setenv=HQ_DB=${absolute}`);
});

test('#send reports what the unit sent inside an atc session once the unit settles the rows', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  const atc = ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  const run: Runner = () => {
    setTimeout(() => {
      for (const row of unsent(ctx.db, true, undefined)) {
        markOutboxSent(ctx.db, row, null);
      }
    }, 300);
    return Promise.resolve({ code: 0, stdout: '', stderr: '' });
  };
  const result = await send(ctx.db, 'all', false, run, 5000);
  expect(result.flushed).toMatchObject({ sent: 1, failed: 0, pending: 0 });
  expect(atc.sent).toHaveLength(0);
});

test('#send waits on --retry inside an atc session for the unit to try a failed row again', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  ctx.startAtc();
  ctx.fileProposal('tidy-docs');
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'old');
  const run: Runner = () => {
    setTimeout(() => {
      for (const row of unsent(ctx.db, true, undefined)) {
        markOutboxSent(ctx.db, row, null);
      }
    }, 300);
    return Promise.resolve({ code: 0, stdout: '', stderr: '' });
  };
  const result = await send(ctx.db, 'all', true, run, 5000);
  expect(result.flushed).toMatchObject({ sent: 1, failed: 0, pending: 0 });
});

test('#send starts no unit inside an atc session when nothing is pending', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  const unit = ctx.buildUnitRunner(0);
  const result = await send(ctx.db, 'all', false, unit.run);
  expect(result.detached).toBeNull();
  expect(unit.calls).toHaveLength(0);
});

test("#setForward sends a retired session's messages to its successor, and moves the queued ones", () => {
  const ctx = setupTest();
  const seq = logEvent(ctx.db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(ctx.db, seq, 'z-kettle', 'FYI one');
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'no live session named z-kettle');
  const seq2 = logEvent(ctx.db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(ctx.db, seq2, 'z-kettle', 'FYI two');
  enqueue(ctx.db, seq2, 'z-teapot', 'FYI two');
  expect(setForward(ctx.db, 'z-kettle', 'z-teapot')).toStrictEqual({ moved: 1, merged: 1 });
  expect(ctx.db.query('SELECT target, status, idem_key, last_error FROM outbox ORDER BY id').all()).toStrictEqual([
    { target: 'z-teapot', status: 'pending', idem_key: `hq-ev${seq}-z-teapot`, last_error: null },
    { target: 'z-teapot', status: 'pending', idem_key: `hq-ev${seq2}-z-teapot`, last_error: null },
  ]);
  const seq3 = logEvent(ctx.db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(ctx.db, seq3, 'z-kettle', 'FYI three');
  expect(readOutboxRows(ctx.db).at(-1)?.target).toBe('z-teapot');
  expect(() => setForward(ctx.db, 'z-teapot', 'z-kettle')).toThrow('loop');
  setForward(ctx.db, 'z-kettle', null);
  enqueue(ctx.db, logEvent(ctx.db, 'hq', 'probe', 'probe', 'z-q', null, null), 'z-kettle', 'FYI four');
  expect(readOutboxRows(ctx.db).at(-1)?.target).toBe('z-kettle');
});

test('#setForward refuses a long forward chain that closes a loop', () => {
  const ctx = setupTest();
  for (const [from, to] of [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'g']] as const) {
    setForward(ctx.db, from, to);
  }
  expect(() => setForward(ctx.db, 'g', 'a')).toThrow('loop');
});

test('#flush sends no row to its old target when the row is dropped or forwarded after the flush selected it', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([
    { id: 'id-stu', name: 'stu', alive: true, state: 'done' },
    { id: 'id-teapot', name: 'z-teapot', alive: true, state: 'done' },
  ]);
  const seq = logEvent(ctx.db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(ctx.db, seq, 'stu', 'one');
  enqueue(ctx.db, seq, 'z-kettle', 'two');
  const original = atc.onMessage;
  atc.onMessage = () => setForward(ctx.db, 'z-kettle', 'z-teapot');
  await flush(ctx.db);
  atc.onMessage = original;
  expect(atc.sent.map((message) => message.session)).toStrictEqual(['id-stu', 'id-teapot']);
});

test('it sends the row a command queues, and leaves the other pending rows unsent', async () => {
  const ctx = setupTest();
  ctx.setCommandCaller();
  const atc = ctx.startAtc();
  ctx.enqueueForeign();
  const code = await ctx.hq('proposal', 'add', 'tidy-docs', '--title', 'Tidy the docs', '--question', 'Merge the two guides?', '--body', 'Invented proposal text.');
  expect(code).toBe(0);
  expect(atc.sent).toStrictEqual([expect.objectContaining({ session: 'id-stu', text: expect.stringContaining('proposal ready: tidy-docs') })]);
  expect(ctx.readStatuses()).toStrictEqual([
    { target: 'z-delivery', status: 'pending' },
    { target: 'stu', status: 'sent' },
  ]);
});

test('it sends nothing from a read-only command', async () => {
  const ctx = setupTest();
  ctx.setCommandCaller();
  const atc = ctx.startAtc();
  ctx.enqueueForeign();
  for (const argv of [['status'], ['outbox'], ['outbox', 'forwards'], ['health', 'settings'], ['typed', 'list'], ['mark', 'list'], ['followup', 'list'], ['run', 'list']]) {
    const code = await ctx.hq(...argv);
    expect(code).toBe(0);
  }
  expect(atc.sent).toHaveLength(0);
  expect(ctx.readStatuses()).toStrictEqual([{ target: 'z-delivery', status: 'pending' }]);
});

test('it sends nothing from a command that fails, and leaks none of its ids into the next command', async () => {
  const ctx = setupTest();
  ctx.setCommandCaller();
  const atc = ctx.startAtc();
  ctx.enqueueForeign();
  const failed = await ctx.hq('proposal', 'open', 'no-such-item');
  expect(failed).toBe(1);
  const status = await ctx.hq('status');
  expect(status).toBe(0);
  expect(atc.sent).toHaveLength(0);
});

test('it sends every pending row on hq outbox flush, and only the listed rows with --ids', async () => {
  const ctx = setupTest();
  ctx.setCommandCaller();
  const atc = ctx.startAtc();
  ctx.enqueueForeign('Invented note one');
  ctx.enqueueForeign('Invented note two');
  const [first] = readOutboxRows(ctx.db);
  invariant(first);
  const flushedFirst = await ctx.hq('outbox', 'flush', '--ids', String(first.id));
  expect(flushedFirst).toBe(0);
  expect(atc.sent.map((message) => message.text)).toStrictEqual(['Invented note one']);
  ctx.enqueueForeign('Invented note three');
  const flushedAll = await ctx.hq('outbox', 'flush');
  expect(flushedAll).toBe(0);
  expect(atc.sent.map((message) => message.text)).toStrictEqual(['Invented note one', 'Invented note two', 'Invented note three']);
  const badIDs = await ctx.hq('outbox', 'flush', '--ids', '1,x');
  expect(badIDs).toBe(1);
});

test("#flush sends every pending and failed row when given no ids, as the watcher's send does", async () => {
  const ctx = setupTest();
  ctx.setCommandCaller();
  ctx.startAtc();
  ctx.seed.outboxItem({ target: 'z-delivery', text: 'Invented pending note' });
  ctx.seed.failedOutboxItem({ target: 'z-delivery', text: 'Invented failed note' });
  const flushed = await flush(ctx.db, { retryFailed: true });
  expect(flushed).toMatchObject({ sent: 2, failed: 0 });
  expect(ctx.db.query('SELECT target, status FROM outbox ORDER BY id').all()).toStrictEqual([
    { target: 'z-delivery', status: 'sent' },
    { target: 'z-delivery', status: 'sent' },
  ]);
});

test('#send tells the detached unit inside a session to send only the rows of this command', async () => {
  const ctx = setupTest();
  ctx.setCommandCaller();
  updateEnv('ATC_SESSION_ID', 'id-caller');
  ctx.enqueueForeign('Invented note one');
  ctx.enqueueForeign('Invented note two');
  const [, second] = readOutboxRows(ctx.db);
  invariant(second);
  const unit = ctx.buildUnitRunner(0);
  const result = await send(ctx.db, [second.id], false, unit.run, 0);
  expect(unit.calls[0]?.cmd.slice(-4)).toStrictEqual(['outbox', 'flush', '--ids', String(second.id)]);
  expect(result.flushed).toMatchObject({ sent: 0, pending: 1 });
  const empty = await send(ctx.db, [], false, unit.run, 0);
  expect(empty.detached).toBeNull();
  expect(unit.calls).toHaveLength(1);
});

test('#flush reaches no atc and keeps a queued message for a retry when sending is on and no fake atc is named', async () => {
  const ctx = setupTest();
  expect(socketPath()).toBe('/nonexistent/hq-test-no-live-atc.sock');
  ctx.fileProposal('tidy-docs');
  const result = await flush(ctx.db);
  expect(result).toMatchObject({ sent: 0, failed: 1 });
  expect(ctx.db.query(`SELECT status FROM outbox`).all()).toStrictEqual([{ status: 'failed' }]);
});

test('#flush asks atc for no answer notice, so no session hears an answer to a send', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc();
  ctx.fileProposal('tidy-docs');

  await flush(ctx.db);

  expect(atc.sent[0]?.notice).toBe(false);
});

function setupTest() {
  const fresh = createTestDb();
  at(NOON_SYDNEY);
  updateEnv('HQ_NOTIFY', undefined);

  // fakeAtc assigns HQ_ATC_SOCKET itself, so record the value the preload puts back before it runs.
  updateEnv('HQ_ATC_SOCKET', undefined);
  const db = fresh.db;

  return {
    db,
    directory: fresh.dir,
    seed: buildSeeder(fresh),
    fileProposal: (id: string) => addAsk(db, { kind: 'proposal', id, title: 'Tidy the docs', question: 'Merge the two guides?', body: 'Invented proposal text.', issues: [], forSession: null, actor: 'z-steward' }),
    enqueueForeign: (text = 'Invented note left by another command') => enqueue(db, logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null), 'z-delivery', text),
    readStatuses: () => db.query('SELECT target, status FROM outbox ORDER BY id').all(),
    hq: (...argv: string[]) => main([...argv, '--json']),
    startAtc: (sessions?: FakeAtcSession[]) => {
      const atc = fakeAtc(fresh.dir, sessions);
      onTestFinished(() => atc.stop());

      return atc;
    },
    setCommandCaller: () => {
      const log = spyOn(console, 'log').mockImplementation(() => {});
      onTestFinished(() => log.mockRestore());
      updateEnv('HQ_AS', 'z-steward');
      updateEnv('ATC_SESSION_ID', undefined);
      updateEnv('ATC_SESSION_RECORD', undefined);
    },
    buildUnitRunner: (code: number) => {
      const calls: { cmd: string[]; opts?: RunOpts }[] = [];
      const run: Runner = (cmd, opts) => {
        calls.push(toExactOptional({ cmd, opts }));
        return Promise.resolve({ code, stdout: '', stderr: code ? 'no user manager' : '' });
      };

      return { run, calls };
    },
  };
}
