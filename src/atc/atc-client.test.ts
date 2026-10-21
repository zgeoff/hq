import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORPCError } from '@orpc/client';
import { startStubAtcDaemon } from '../../test/start-stub-atc-daemon.ts';
import { overrideEnv } from '../config/override-env.ts';
import { AtcClient } from './atc-client.ts';
import { eventsReadSchema } from './events-read-schema.ts';
import { sessionGetSchema } from './session-get-schema.ts';
import { sessionSpawnSchema } from './session-spawn-schema.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-atc-client-')),
    path = join(dir, 'atc.sock');
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', path));
  return { path };
}

test('it lists the sessions the daemon answers with', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [{ id: 's1-a', name: 'kettle', alive: true, state: 'running' }] }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.sessions()).resolves.toStrictEqual([{ id: 's1-a', name: 'kettle', alive: true, state: 'running' }]);
});

test('it asks the daemon for a session by id', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.get': () => ({ session: { id: 's1-a' }, prompt: 'boil water', lastActivityAt: 1700, pending: null, result: null, sessionRecord: null }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  await peer.call('session.get', { session: 's1-a' }, sessionGetSchema);

  expect(daemon.requests.at(-1)).toStrictEqual({ method: 'session.get', input: { session: 's1-a' } });
});

test('it returns the prompt and last activity of a session', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.get': () => ({ session: { id: 's1-a' }, prompt: 'boil water', lastActivityAt: 1700, pending: null, result: null, sessionRecord: null }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.call('session.get', { session: 's1-a' }, sessionGetSchema)).resolves.toMatchObject({ prompt: 'boil water', lastActivityAt: 1700 });
});

test('it spawns a session and sends the spawn as given', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.spawn': () => ({ session: { id: 's2-b' }, warnings: [] }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  await peer.call('session.spawn', { cwd: '/srv/invented', name: 'teapot', prompt: 'steep' }, sessionSpawnSchema);

  expect(daemon.requests.at(-1)).toStrictEqual({ method: 'session.spawn', input: { cwd: '/srv/invented', name: 'teapot', prompt: 'steep' } });
});

test('it reads the id of a spawned session', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.spawn': () => ({ session: { id: 's2-b' } }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.call('session.spawn', { cwd: '/srv/invented' }, sessionSpawnSchema)).resolves.toMatchObject({ session: { id: 's2-b' } });
});

test('it rejects a spawn answer without a session id as a bad atc answer', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.spawn': () => ({ session: {} }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.call('session.spawn', { cwd: '/srv/invented' }, sessionSpawnSchema)).rejects.toMatchObject({ code: 'bad_atc_answer', data: { method: 'session.spawn', field: 'session.id' } });
});

test('it pins and submits to a session', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.submit': () => ({}), 'session.update': () => ({}) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  await peer.request('session.update', { session: 's1-a', pinned: true });
  await peer.request('session.submit', { session: 's1-a', text: 'go' });

  expect(daemon.requests.slice(1)).toStrictEqual([
    { method: 'session.update', input: { session: 's1-a', pinned: true } },
    { method: 'session.submit', input: { session: 's1-a', text: 'go' } },
  ]);
});

test('it reads an events page with its cursor and more flag', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'events.read': () => ({ events: [{ cursor: 'c-2', at: 1700, session: 's1-a', name: 'kettle', kind: 'note', detail: 'boiled', label: 'done' }], cursor: 'c-2', more: true }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.call('events.read', { cursor: 'c-1', limit: 200 }, eventsReadSchema)).resolves.toStrictEqual({ events: [{ cursor: 'c-2', at: 1700, session: 's1-a', name: 'kettle', kind: 'note', detail: 'boiled', label: 'done' }], cursor: 'c-2', more: true });
});

test('it asks the daemon for the events after a cursor', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'events.read': () => ({ events: [], cursor: 'c-1', more: false }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  await peer.call('events.read', { cursor: 'c-1', limit: 200 }, eventsReadSchema);

  expect(daemon.requests.at(-1)).toStrictEqual({ method: 'events.read', input: { cursor: 'c-1', limit: 200 } });
});

test('it sends a message and returns the id the daemon gives it', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.message': () => ({ message: 'm-7', status: 'queued' }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.message('s1-a', 'steep now', 'hq', 'key-1')).resolves.toBe('m-7');
});

test('it sends a message with its session, text, sender, idempotency key and no answer notice', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.message': () => ({ message: 'm-7', status: 'queued' }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  await peer.message('s1-a', 'steep now', 'hq', 'key-1');

  expect(daemon.requests.at(-1)).toStrictEqual({ method: 'session.message', input: { session: 's1-a', text: 'steep now', from: 'hq', idempotencyKey: 'key-1', notice: false } });
});

test('it rejects a message answer without an id as a bad atc answer', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.message': () => ({ status: 'queued' }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.message('s1-a', 'steep now', 'hq', 'key-1')).rejects.toMatchObject({ code: 'bad_atc_answer', data: { method: 'session.message', field: 'message' } });
});

test('it rejects a message answer without a string status as a bad atc answer', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.message': () => ({ message: 'm-7' }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.message('s1-a', 'steep now', 'hq', 'key-1')).rejects.toMatchObject({ code: 'bad_atc_answer', data: { method: 'session.message', field: 'status' } });
});

test.each([
  ['a missing prompt', { session: { id: 's1-a' }, lastActivityAt: 1700 }, 'prompt'],
  ['a missing last activity', { session: { id: 's1-a' }, prompt: 'boil water' }, 'lastActivityAt'],
  ['a null last activity', { session: { id: 's1-a' }, prompt: 'boil water', lastActivityAt: null }, 'lastActivityAt'],
  ['a non-numeric last activity', { session: { id: 's1-a' }, prompt: 'boil water', lastActivityAt: '1700' }, 'lastActivityAt'],
])('it rejects a session answer with %s as a bad atc answer', async (_label, answer, field) => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.get': () => answer }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.call('session.get', { session: 's1-a' }, sessionGetSchema)).rejects.toMatchObject({ code: 'bad_atc_answer', data: { method: 'session.get', field } });
});

test('it maps a daemon error to atc_<code> and keeps the message', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {
      'session.get': () => {
        throw new ORPCError('no_such_session', { message: "no session 's9-z'", data: { session: 's9-z' } });
      },
    }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.request('session.get', { session: 's9-z' })).rejects.toMatchObject({ code: 'atc_no_such_session', message: "no session 's9-z'" });
});

test('it decodes an error code it does not know as internal and keeps the message', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {
      'session.get': () => {
        throw new ORPCError('teapot_overheated', { message: 'the kettle boiled over' });
      },
    }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.request('session.get', { session: 's1-a' })).rejects.toMatchObject({ code: 'atc_internal', message: 'the kettle boiled over' });
});

test('it keeps the cursor message of a bad_args refusal so a feed reset is recognised', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {
      'events.read': () => {
        throw new ORPCError('bad_args', { message: "'zzz' is not an events.read cursor" });
      },
    }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.call('events.read', { cursor: 'zzz', limit: 200 }, eventsReadSchema)).rejects.toMatchObject({ code: 'atc_bad_args', message: "'zzz' is not an events.read cursor" });
});

test('it refuses a method the daemon does not serve as atc_unknown_method', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });

  expect(peer.request('session.teleport', {})).rejects.toMatchObject({ code: 'atc_unknown_method' });
});

test.each(['session.message', 'session.submit', 'session.input', 'session.spawn', 'session.kill', 'session.update', 'session.forget'])('it refuses a %s to a socket the test did not name, before it goes out', async (method) => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', undefined));

  expect(peer.request(method, { session: 'x', text: 'invented' })).rejects.toMatchObject({ code: 'atc_write_refused' });
  expect(daemon.requests.map((request) => request.method)).toStrictEqual(['daemon.hello']);
});

test.each(['session.kill', 'session.update', 'session.forget'])('it refuses a %s from a scratch database without a named socket, before it goes out', async (method) => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', undefined));
  onTestFinished(overrideEnv('NODE_ENV', 'production'));
  onTestFinished(overrideEnv('HOME', '/home/invented'));
  onTestFinished(overrideEnv('HQ_DB', '/home/invented/scratch/r99.db'));

  expect(peer.request(method, { session: 'x' })).rejects.toMatchObject({ code: 'atc_write_refused' });
  expect(daemon.requests.map((request) => request.method)).toStrictEqual(['daemon.hello']);
});

test('it still sends a read to a socket the test did not name', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [] }) }),
    peer = await AtcClient.open(ctx.path);
  onTestFinished(() => {
    peer.close();
    daemon.stop();
  });
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', undefined));

  expect(peer.request('session.list')).resolves.toStrictEqual({ sessions: [] });
});
