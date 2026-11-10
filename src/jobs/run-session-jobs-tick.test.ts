import { expect, onTestFinished, test } from 'bun:test';
import { at, fakeAtc, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { flush } from '../outbox/flush.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { runSessionJobsTick } from './run-session-jobs-tick.ts';
import { readJobs, removeJob, writeJob } from './session-jobs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOTIFY', undefined));
  return {
    db: fresh.db,
    dir: fresh.dir,
    readTexts: () => readOutboxRows(fresh.db).map((row) => row.text),
    readNextAts: () => readJobs(fresh.db, null).map((job) => job.next_at),
  };
}

test('it fires a due job once into the role inbox, and a second tick in the same slot sends nothing', () => {
  const ctx = setupTest();
  at('2026-11-10T00:00:00Z');
  writeJob(ctx.db, { target: 'z-release', value: { kind: 'every', spec: '2h' }, prompt: 'check the release queue', nextAt: new Date('2026-11-10T02:00:00Z'), actor: 'z-release' });

  const early = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T01:55:00Z'));
  const first = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T02:03:00Z'));
  const second = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T02:08:00Z'));

  expect({ early, first, second, texts: ctx.readTexts(), nextAts: ctx.readNextAts() }).toStrictEqual({
    early: [],
    first: [{ id: 1, target: 'z-release', slot: '2026-11-10T02:00:00Z' }],
    second: [],
    texts: ['hq job 1: check the release queue'],
    nextAts: ['2026-11-10T04:00:00Z'],
  });
});

test('it fires again at the next slot', () => {
  const ctx = setupTest();
  at('2026-11-10T00:00:00Z');
  writeJob(ctx.db, { target: 'z-release', value: { kind: 'every', spec: '2h' }, prompt: 'check the release queue', nextAt: new Date('2026-11-10T02:00:00Z'), actor: 'z-release' });
  runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T02:03:00Z'));

  const next = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T04:01:00Z'));

  expect(next).toStrictEqual([{ id: 1, target: 'z-release', slot: '2026-11-10T04:00:00Z' }]);
});

test('it fires a job once after downtime across several slots, then moves to the next slot after now', () => {
  const ctx = setupTest();
  at('2026-11-10T00:00:00Z');
  writeJob(ctx.db, { target: 'z-release', value: { kind: 'every', spec: '2h' }, prompt: 'check the release queue', nextAt: new Date('2026-11-10T02:00:00Z'), actor: 'z-release' });

  const caughtUp = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T09:10:00Z'));
  const after = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T09:15:00Z'));

  expect({ caughtUp, after, texts: ctx.readTexts(), nextAts: ctx.readNextAts() }).toStrictEqual({
    caughtUp: [{ id: 1, target: 'z-release', slot: '2026-11-10T02:00:00Z' }],
    after: [],
    texts: ['hq job 1: check the release queue'],
    nextAts: ['2026-11-10T10:00:00Z'],
  });
});

test('it moves a daily job to the same time tomorrow after it fires', () => {
  const ctx = setupTest();
  at('2026-11-10T00:00:00Z');
  writeJob(ctx.db, { target: 'z-delivery', value: { kind: 'daily', spec: '09:30Z' }, prompt: 'run the nightly batch', nextAt: new Date('2026-11-10T09:30:00Z'), actor: 'z-stu' });

  runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T09:32:00Z'));

  expect(ctx.readNextAts()).toStrictEqual(['2026-11-11T09:30:00Z']);
});

test('it fires a one-shot job once and ends it', () => {
  const ctx = setupTest();
  at('2026-11-10T00:00:00Z');
  writeJob(ctx.db, { target: 'z-release', value: { kind: 'at', spec: '2026-11-10T03:00:00Z' }, prompt: 'read the deploy result', nextAt: new Date('2026-11-10T03:00:00Z'), actor: 'z-release' });

  const first = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T03:02:00Z'));
  const later = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T09:00:00Z'));

  expect({ first, later, texts: ctx.readTexts(), remaining: readJobs(ctx.db, null) }).toStrictEqual({
    first: [{ id: 1, target: 'z-release', slot: '2026-11-10T03:00:00Z' }],
    later: [],
    texts: ['hq job 1: read the deploy result'],
    remaining: [],
  });
});

test('it sends nothing for a removed job', () => {
  const ctx = setupTest();
  at('2026-11-10T00:00:00Z');
  const job = writeJob(ctx.db, { target: 'z-release', value: { kind: 'every', spec: '2h' }, prompt: 'check the release queue', nextAt: new Date('2026-11-10T02:00:00Z'), actor: 'z-release' });
  removeJob(ctx.db, job.id, 'z-release');

  const fired = runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T02:03:00Z'));

  expect({ fired, texts: ctx.readTexts() }).toStrictEqual({ fired: [], texts: [] });
});

test('it still reaches the role after its session id changes', async () => {
  const ctx = setupTest();
  const sessions = [{ id: 'kettle-old', name: 'z-release', alive: true, state: 'done' }];
  const atc = fakeAtc(ctx.dir, sessions);
  onTestFinished(() => atc.stop());
  at('2026-11-10T00:00:00Z');
  writeJob(ctx.db, { target: 'z-release', value: { kind: 'every', spec: '2h' }, prompt: 'check the release queue', nextAt: new Date('2026-11-10T02:00:00Z'), actor: 'z-release' });
  runSessionJobsTick(ctx.db, 'hq', new Date('2026-11-10T02:03:00Z'));
  sessions.splice(0, 1, { id: 'kettle-new', name: 'z-release', alive: true, state: 'done' });

  await flush(ctx.db);

  expect(atc.sent.map((message) => ({ session: message.session, text: message.text }))).toStrictEqual([{ session: 'kettle-new', text: 'hq job 1: check the release queue' }]);
});
