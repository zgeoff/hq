import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { addAsk } from '../src/asks/add-ask.ts';
import { socketPath } from '../src/atc/socket-path.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { enqueue } from '../src/outbox/enqueue.ts';
import { flush } from '../src/outbox/flush.ts';
import { setForward } from '../src/outbox/set-forward.ts';
import { logEvent } from '../src/log-event.ts';
import { main } from '../src/cli.ts';
import { send } from '../src/send/send.ts';
import type { RunOpts, Runner } from '../src/runner/types.ts';
import type { FakeAtc } from './helpers.ts';
import { NOON_SYDNEY, at, fakeAtc, freshDb, requireEnv } from './helpers.ts';

let db: Database;
let dir: string;
let cleanup: () => void;
let atc: FakeAtc | null = null;

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  at(NOON_SYDNEY);
  delete process.env['HQ_NOTIFY'];
});
afterEach(() => {
  atc?.stop();
  atc = null;
  delete process.env['HQ_ATC_SOCKET'];
  cleanup();
});

const file = (id: string) =>
  addAsk(db, { kind: 'proposal', id, title: 'Tidy the docs', question: 'Merge the two guides?', body: 'Invented proposal text.', issues: [], forSession: null, actor: 'z-steward' });

test('sends pending messages to the session by name, once', async () => {
  atc = fakeAtc(dir);
  file('tidy-docs');
  expect(await flush(db)).toMatchObject({ sent: 1, failed: 0 });
  expect(atc.sent).toEqual([{ session: 'id-stu', text: expect.stringContaining('proposal ready: tidy-docs'), from: 'hq', idempotencyKey: expect.stringMatching(/^hq-ev\d+-z-stu$/u), notice: false }]);
  expect(await flush(db, { retryFailed: true })).toMatchObject({ sent: 0 });
  expect(atc.sent).toHaveLength(1);
});

test('a dead daemon keeps the message for a retry, and the retry reuses its key', async () => {
  process.env['HQ_ATC_SOCKET'] = `${dir}/nobody-home.sock`;
  file('tidy-docs');
  const r = await flush(db);
  expect(r.failed).toBe(1);
  const row = db.query('SELECT status, idem_key FROM outbox').get() as { status: string; idem_key: string };
  expect(row.status).toBe('failed');
  atc = fakeAtc(dir);
  expect(await flush(db)).toMatchObject({ sent: 0 }); // failed rows wait for --retry
  expect(await flush(db, { retryFailed: true })).toMatchObject({ sent: 1 });
  expect(atc.sent[0]!.idempotencyKey).toBe(row.idem_key);
});

test('it leaves a row sent when another flush sent it while this one failed to reach atc', async () => {
  process.env['HQ_ATC_SOCKET'] = `${dir}/nobody-home.sock`;
  file('tidy-docs');
  const pending = flush(db);
  db.query("UPDATE outbox SET status = 'sent', attempts = 1, sent_at = ?").run(NOON_SYDNEY);
  const result = await pending;
  expect(result).toMatchObject({ failed: 0, errors: [] });
  expect(db.query('SELECT status, attempts, last_error FROM outbox').all()).toStrictEqual([{ status: 'sent', attempts: 1, last_error: null }]);
});

test('a fleet session renamed under hq still gets its message, by the id hq fleet recorded', async () => {
  // Invented: z-stu's session now shows as "stu"; another session took the name "z-stu".
  atc = fakeAtc(dir, [
    { id: 'id-stu', name: 'stu', alive: true, state: 'done' },
    { id: 'id-other', name: 'z-stu', alive: true, state: 'done' },
  ]);
  setMeta(db, 'fleet_ids', JSON.stringify({ 'z-stu': 'id-stu' }));
  file('tidy-docs');
  expect(await flush(db)).toMatchObject({ sent: 1, failed: 0 });
  expect(atc.sent[0]!.session).toBe('id-stu');
});

test('a recorded id whose session is gone falls back to the name', async () => {
  atc = fakeAtc(dir, [
    { id: 'id-old', name: 'stu', alive: false, state: 'exited' },
    { id: 'id-new', name: 'z-stu', alive: true, state: 'done' },
  ]);
  setMeta(db, 'fleet_ids', JSON.stringify({ 'z-stu': 'id-old' }));
  file('tidy-docs');
  expect(await flush(db)).toMatchObject({ sent: 1 });
  expect(atc.sent[0]!.session).toBe('id-new');
});

test('an unknown or ambiguous session name fails that message only', async () => {
  atc = fakeAtc(dir, [
    { id: 'a', name: 'z-stu', alive: true, state: 'done' },
    { id: 'b', name: 'z-stu', alive: true, state: 'done' },
  ]);
  file('tidy-docs');
  const r = await flush(db);
  expect(r.failed).toBe(1);
  expect(r.errors[0]).toContain('2 live sessions are named z-stu');
});

test('HQ_NOTIFY=off leaves messages pending', async () => {
  process.env['HQ_NOTIFY'] = 'off';
  file('tidy-docs');
  expect((await flush(db)).skipped).toBe(true);
  expect((db.query('SELECT status FROM outbox').get() as { status: string }).status).toBe('pending');
});

test('a ready notice for an item that left the queue before sending is dropped', async () => {
  atc = fakeAtc(dir);
  file('tidy-docs');
  db.query(`UPDATE asks SET state = 'later' WHERE id = 'tidy-docs'`).run();
  const r = await flush(db);
  expect(r).toMatchObject({ sent: 0, dropped: 1 });
  expect(atc.sent).toHaveLength(0);
});

describe('inside an atc session', () => {
  const saved = { id: process.env['ATC_SESSION_ID'], record: process.env['ATC_SESSION_RECORD'] };
  beforeEach(() => {
    process.env['ATC_SESSION_ID'] = 'id-caller';
  });
  afterEach(() => {
    if (saved.id === undefined) {
      delete process.env['ATC_SESSION_ID'];
    } else {
      process.env['ATC_SESSION_ID'] = saved.id;
    }
    if (saved.record === undefined) {
      delete process.env['ATC_SESSION_RECORD'];
    } else {
      process.env['ATC_SESSION_RECORD'] = saved.record;
    }
  });
  const runner = (code: number) => {
    const calls: { cmd: string[]; opts?: RunOpts }[] = [];
    const run: Runner = async (cmd, opts) => {
      calls.push(toExactOptional({ cmd, opts }));
      return { code, stdout: '', stderr: code ? 'no user manager' : '' };
    };
    return { run, calls };
  };

  test('hands the send to a detached unit and sends nothing itself', async () => {
    atc = fakeAtc(dir);
    file('tidy-docs');
    const { run, calls } = runner(0);
    const r = await send(db, 'all', false, run, 0);
    expect(r.detached?.unit).toMatch(/^hq-send-/);
    expect(r.flushed).toMatchObject({ sent: 0, pending: 1 });
    expect(atc.sent).toHaveLength(0);
    expect(calls[0]?.cmd.slice(0, 2)).toEqual(['systemd-run', '--user']);
    expect(calls[0]?.cmd.slice(-2)).toEqual(['outbox', 'flush']);
    expect(calls[0]?.cmd.findLast((a) => a.startsWith('--setenv=HQ_DB='))).toBe(`--setenv=HQ_DB=${process.env['HQ_DB']}`);
    expect(calls[0]?.cmd).toContain('--setenv=ATC_SESSION_ID=');
    expect(calls[0]?.opts?.env?.['ATC_SESSION_ID']).toBeUndefined();
    expect((db.query('SELECT status FROM outbox').get() as { status: string }).status).toBe('pending');
  });

  test('sends inline when the unit cannot start', async () => {
    atc = fakeAtc(dir);
    file('tidy-docs');
    const r = await send(db, 'all', false, runner(1).run);
    expect(r.detached?.error).toBe('no user manager');
    expect(r.flushed).toMatchObject({ sent: 1 });
  });

  test('sends inline when systemd-run is missing, and pins a relative HQ_DB', async () => {
    const abs = requireEnv('HQ_DB');
    atc = fakeAtc(dir);
    file('tidy-docs');
    const missing: Runner = async () => {
      throw new Error('ENOENT: posix_spawn systemd-run');
    };
    expect(await send(db, 'all', false, missing)).toMatchObject({ flushed: { sent: 1 } });
    const { run, calls } = runner(0);
    const cwd = process.cwd();
    process.chdir(dir);
    process.env['HQ_DB'] = abs.slice(dir.length + 1);
    try {
      file('tidy-docs-2');
      await send(db, 'all', false, run, 0);
      expect(calls[0]?.cmd).toContain(`--setenv=HQ_DB=${abs}`);
    } finally {
      process.env['HQ_DB'] = abs;
      process.chdir(cwd);
    }
  });

  test('reports what the unit sent once it settles the rows', async () => {
    atc = fakeAtc(dir);
    file('tidy-docs');
    const run: Runner = async () => {
      setTimeout(() => db.query(`UPDATE outbox SET status = 'sent'`).run(), 300);
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await send(db, 'all', false, run, 5_000);
    expect(r.flushed).toMatchObject({ sent: 1, failed: 0, pending: 0 });
    expect(atc.sent).toHaveLength(0); // the unit sent it, not this process
  });

  test('a --retry waits for the unit to try a failed row again', async () => {
    atc = fakeAtc(dir);
    file('tidy-docs');
    db.query(`UPDATE outbox SET status = 'failed', attempts = 1, last_error = 'old'`).run();
    const run: Runner = async () => {
      setTimeout(() => db.query(`UPDATE outbox SET status = 'sent', attempts = 2`).run(), 300);
      return { code: 0, stdout: '', stderr: '' };
    };
    expect((await send(db, 'all', true, run, 5_000)).flushed).toMatchObject({ sent: 1, failed: 0, pending: 0 });
  });

  test('starts no unit when nothing is pending', async () => {
    const { run, calls } = runner(0);
    expect((await send(db, 'all', false, run)).detached).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

test('a forward sends a retired session\'s messages to its successor, and moves the queued ones', () => {
  const seq = logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(db, seq, 'z-kettle', 'FYI one');
  db.query(`UPDATE outbox SET status = 'failed', last_error = 'no live session named z-kettle'`).run();
  const seq2 = logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(db, seq2, 'z-kettle', 'FYI two');
  enqueue(db, seq2, 'z-teapot', 'FYI two');
  expect(setForward(db, 'z-kettle', 'z-teapot')).toEqual({ moved: 1, merged: 1 });
  expect(db.query('SELECT target, status, idem_key, last_error FROM outbox ORDER BY id').all()).toEqual([
    { target: 'z-teapot', status: 'pending', idem_key: `hq-ev${seq}-z-teapot`, last_error: null },
    { target: 'z-teapot', status: 'pending', idem_key: `hq-ev${seq2}-z-teapot`, last_error: null },
  ]);
  const seq3 = logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(db, seq3, 'z-kettle', 'FYI three');
  expect((db.query('SELECT target FROM outbox ORDER BY id DESC LIMIT 1').get() as { target: string }).target).toBe('z-teapot');
  expect(() => setForward(db, 'z-teapot', 'z-kettle')).toThrow('loop');
  setForward(db, 'z-kettle', null);
  enqueue(db, logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null), 'z-kettle', 'FYI four');
  expect((db.query('SELECT target FROM outbox ORDER BY id DESC LIMIT 1').get() as { target: string }).target).toBe('z-kettle');
});

test('a long forward chain that closes a loop is refused', () => {
  for (const [a, b] of [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'g']] as const) setForward(db, a, b);
  expect(() => setForward(db, 'g', 'a')).toThrow('loop');
});

test('a row dropped or forwarded after the flush selected it is not sent to the old target', async () => {
  atc = fakeAtc(dir, [
    { id: 'id-stu', name: 'z-stu', alive: true, state: 'done' },
    { id: 'id-teapot', name: 'z-teapot', alive: true, state: 'done' },
  ]);
  const seq = logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null);
  enqueue(db, seq, 'z-stu', 'one');
  enqueue(db, seq, 'z-kettle', 'two');
  // the first send (to z-stu) is where the forward lands, before the z-kettle row is read again
  const orig = atc.onMessage;
  atc.onMessage = () => setForward(db, 'z-kettle', 'z-teapot');
  await flush(db);
  atc.onMessage = orig;
  expect(atc.sent.map((m) => m.session)).toEqual(['id-stu', 'id-teapot']);
});

describe('a command sends only the rows it queued', () => {
  const origLog = console.log;
  const keys = ['HQ_AS', 'ATC_SESSION_ID', 'ATC_SESSION_RECORD'] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  beforeEach(() => {
    console.log = () => {};
    process.env['HQ_AS'] = 'z-steward';
    // main() sends inline here; outside an atc session there is no detached unit
    delete process.env['ATC_SESSION_ID'];
    delete process.env['ATC_SESSION_RECORD'];
  });
  afterEach(() => {
    console.log = origLog;
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  // A row another command left pending, e.g. one whose own send failed to start.
  const foreign = (text = 'Invented note left by another command') => enqueue(db, logEvent(db, 'hq', 'probe', 'probe', 'z-q', null, null), 'z-delivery', text);
  const statuses = () => db.query('SELECT target, status FROM outbox ORDER BY id').all();
  const hq = (...argv: string[]) => main([...argv, '--json']);

  test('a command that queues a row sends that row and leaves the other pending rows unsent', async () => {
    atc = fakeAtc(dir);
    foreign();
    expect(await hq('proposal', 'add', 'tidy-docs', '--title', 'Tidy the docs', '--question', 'Merge the two guides?', '--body', 'Invented proposal text.')).toBe(0);
    expect(atc.sent).toEqual([expect.objectContaining({ session: 'id-stu', text: expect.stringContaining('proposal ready: tidy-docs') })]);
    expect(statuses()).toEqual([
      { target: 'z-delivery', status: 'pending' },
      { target: 'z-stu', status: 'sent' },
    ]);
  });

  test('a read-only command sends nothing', async () => {
    atc = fakeAtc(dir);
    foreign();
    // status and outbox list were never on the old read-only list, and sent other commands' rows.
    for (const argv of [['status'], ['outbox'], ['outbox', 'forwards'], ['health', 'settings'], ['typed', 'list'], ['mark', 'list'], ['followup', 'list'], ['run', 'list']]) {
      expect(await hq(...argv)).toBe(0);
    }
    expect(atc.sent).toHaveLength(0);
    expect(statuses()).toEqual([{ target: 'z-delivery', status: 'pending' }]);
  });

  test('a command that fails sends nothing, and its ids do not leak into the next command', async () => {
    atc = fakeAtc(dir);
    foreign(); // queued in this process, as a failed command's rows would be
    expect(await hq('proposal', 'open', 'no-such-item')).toBe(1);
    expect(await hq('status')).toBe(0);
    expect(atc.sent).toHaveLength(0);
  });

  test('hq outbox flush sends every pending row; --ids sends only those', async () => {
    atc = fakeAtc(dir);
    foreign('Invented note one');
    foreign('Invented note two');
    const [first] = db.query('SELECT id FROM outbox ORDER BY id').all() as { id: number }[];
    expect(await hq('outbox', 'flush', '--ids', String(first!.id))).toBe(0);
    expect(atc.sent.map((m) => m.text)).toEqual(['Invented note one']);
    foreign('Invented note three');
    expect(await hq('outbox', 'flush')).toBe(0);
    expect(atc.sent.map((m) => m.text)).toEqual(['Invented note one', 'Invented note two', 'Invented note three']);
    expect(await hq('outbox', 'flush', '--ids', '1,x')).toBe(1);
  });

  test("the watcher's send (flush with no ids) sends every pending and failed row", async () => {
    atc = fakeAtc(dir);
    foreign('Invented pending note');
    foreign('Invented failed note');
    db.query(`UPDATE outbox SET status = 'failed', attempts = 1 WHERE text = 'Invented failed note'`).run();
    // the exact call the lanes watcher makes each tick (src/cli.ts, `lanes watch`)
    expect(await flush(db, { retryFailed: true })).toMatchObject({ sent: 2, failed: 0 });
    expect(statuses()).toEqual([
      { target: 'z-delivery', status: 'sent' },
      { target: 'z-delivery', status: 'sent' },
    ]);
  });

  test('inside a session, the detached unit is told to send only the rows of this command', async () => {
    // afterEach restores it
    process.env['ATC_SESSION_ID'] = 'id-caller';
    foreign('Invented note one');
    foreign('Invented note two');
    const [, second] = db.query('SELECT id FROM outbox ORDER BY id').all() as { id: number }[];
    const calls: string[][] = [];
    const run: Runner = async (cmd) => {
      calls.push(cmd);
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await send(db, [second!.id], false, run, 0);
    expect(calls[0]!.slice(-4)).toEqual(['outbox', 'flush', '--ids', String(second!.id)]);
    expect(r.flushed).toMatchObject({ sent: 0, pending: 1 }); // waits on its own row, not both
    expect((await send(db, [], false, run, 0)).detached).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

test('with sending on and no fake atc named, a queued message reaches no atc and stays for a retry', async () => {
  // as in a test that forgot to set up a fake atc
  delete process.env['HQ_ATC_SOCKET'];
  expect(socketPath()).toBe('/nonexistent/hq-test-no-live-atc.sock');
  file('tidy-docs');
  expect(await flush(db)).toMatchObject({ sent: 0, failed: 1 });
  expect(db.query(`SELECT status FROM outbox`).all()).toEqual([{ status: 'failed' }]);
});

test('the flush asks atc for no answer notice, so no session hears an answer to a send', async () => {
  atc = fakeAtc(dir);
  file('tidy-docs');

  await flush(db);

  expect(atc.sent[0]?.notice).toBe(false);
});
