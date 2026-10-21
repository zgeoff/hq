import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStubAtcDaemon } from '../../test/start-stub-atc-daemon.ts';
import { openAtcPeer } from './open-atc-peer.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-atc-peer-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return { path: join(dir, 'atc.sock') };
}

test('it sends a hello first that names hq, protocol 8 and no auth', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [] }) }),
    peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => {
    peer.stop();
    daemon.stop();
  });

  await peer.send('session.list', {});

  expect(daemon.requests.map((request) => request.method)).toStrictEqual(['daemon.hello', 'session.list']);
  expect(daemon.requests[0]).toStrictEqual({ method: 'daemon.hello', input: { client: 'hq', protocol: 8, auth: { scheme: 'none' } } });
});

test('it answers a request with the daemon answer object', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [{ id: 's1-a' }] }) }),
    peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => {
    peer.stop();
    daemon.stop();
  });

  expect(peer.send('session.list', {})).resolves.toStrictEqual({ sessions: [{ id: 's1-a' }] });
});

test('it stops with both versions when the daemon refuses the hello as protocol_mismatch', () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}, { build: '7.1.0', protocol: 9 });
  onTestFinished(() => daemon.stop());

  expect(openAtcPeer(ctx.path, 1000)).rejects.toMatchObject({
    code: 'atc_protocol_mismatch',
    message: 'atc 7.1.0 speaks protocol v9; hq speaks protocol v8. hq and atc install together: install the hq release that matches this atc.',
  });
});

test('it says the daemon speaks an older protocol when it closes the hello with no answer', () => {
  const ctx = setupTest(),
    server = Bun.listen({
      unix: ctx.path,
      socket: {
        data(socket) {
          socket.end();
        },
      },
    });
  onTestFinished(() => server.stop(true));

  expect(openAtcPeer(ctx.path, 1000)).rejects.toMatchObject({
    code: 'atc_protocol_mismatch',
    message: "the atc daemon speaks an older protocol than hq's v8 and closed the connection with no answer. hq and atc install together: install the hq release that matches this atc.",
  });
});

test('it says the daemon speaks an older protocol when it answers in the line protocol', () => {
  const ctx = setupTest(),
    server = Bun.listen({
      unix: ctx.path,
      socket: {
        data(socket) {
          socket.write(`${JSON.stringify({ v: 4, id: 0, err: { code: 'bad_args', msg: 'malformed line: missing v' } })}\n`);
        },
      },
    });
  onTestFinished(() => server.stop(true));

  expect(openAtcPeer(ctx.path, 1000)).rejects.toMatchObject({ code: 'atc_protocol_mismatch', message: expect.stringContaining('speaks an older protocol') });
});

test('it gives up on a hello the daemon never answers', () => {
  const ctx = setupTest(),
    server = Bun.listen({
      unix: ctx.path,
      socket: {
        data() {},
      },
    });
  onTestFinished(() => server.stop(true));

  expect(openAtcPeer(ctx.path, 100)).rejects.toMatchObject({ code: 'atc_unreachable', message: 'atc did not answer daemon.hello' });
});

test('it gives up on a request the daemon never answers', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => new Promise(() => {}) }),
    peer = await openAtcPeer(ctx.path, 150);
  onTestFinished(() => {
    peer.stop();
    daemon.stop();
  });

  expect(peer.send('session.list', {})).rejects.toMatchObject({ code: 'atc_unreachable', message: 'atc did not answer session.list' });
});

test('it rejects a request once the daemon has gone', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [] }) }),
    peer = await openAtcPeer(ctx.path, 300);
  onTestFinished(() => peer.stop());

  daemon.stop();

  expect(peer.send('session.list', {})).rejects.toMatchObject({ code: 'atc_unreachable' });
});

test('it rejects a request after the client is stopped', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [] }) }),
    peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => daemon.stop());

  peer.stop();

  expect(peer.send('session.list', {})).rejects.toMatchObject({ code: 'atc_unreachable', message: 'client closed' });
});

test('it reports a socket nobody listens on as unreachable', () => {
  const ctx = setupTest();

  expect(openAtcPeer(ctx.path, 300)).rejects.toThrow();
});
