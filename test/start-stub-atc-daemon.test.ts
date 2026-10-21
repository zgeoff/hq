import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAtcPeer } from '../src/atc/open-atc-peer.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-stub-atc-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return { path: join(dir, 'atc.sock') };
}

test('it refuses a hello on another protocol with the mismatch text atc writes', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}, { build: '7.1.0', protocol: 9 }),
    lines = Promise.withResolvers<unknown>(),
    socket = await Bun.connect({
      unix: ctx.path,
      socket: {
        data(_socket, chunk) {
          lines.resolve(JSON.parse(new TextDecoder().decode(chunk)));
        },
      },
    });
  onTestFinished(() => {
    socket.end();
    daemon.stop();
  });

  socket.write(`${JSON.stringify({ i: '1', p: { u: '/daemon/hello', b: { json: { client: 'hq', protocol: 8 } } } })}\n`);

  expect(lines.promise).resolves.toMatchObject({
    i: '1',
    p: { b: { json: { code: 'protocol_mismatch', message: 'hq speaks protocol v8, daemon 7.1.0 speaks v9; restart the daemon so both run the same build' } } },
  });
});

test('it answers a hello on its own protocol and records it', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}),
    peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => {
    peer.stop();
    daemon.stop();
  });

  expect(daemon.requests).toStrictEqual([{ method: 'daemon.hello', input: { client: 'hq', protocol: 8, auth: { scheme: 'none' } } }]);
});

test('it records each procedure it answers under its dotted method name', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [] }) }),
    peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => {
    peer.stop();
    daemon.stop();
  });

  await peer.send('session.list', {});

  expect(daemon.requests.map((request) => request.method)).toStrictEqual(['daemon.hello', 'session.list']);
});

test('it answers a method it does not serve as unknown_method', async () => {
  const ctx = setupTest(),
    daemon = startStubAtcDaemon(ctx.path, {}),
    peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => {
    peer.stop();
    daemon.stop();
  });

  expect(peer.send('session.teleport', {})).rejects.toMatchObject({ code: 'atc_unknown_method' });
});
