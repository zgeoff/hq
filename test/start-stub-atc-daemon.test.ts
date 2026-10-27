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
    daemon = startStubAtcDaemon(ctx.path, {}, { build: '7.1.0', protocol: 11 }),
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

  // oxlint-disable-next-line id-length -- atc's wire names its fields i, p, u and b
  socket.write(`${JSON.stringify({ i: '1', p: { u: '/daemon/hello', b: { json: { client: 'hq', protocol: 12 } } } })}\n`);

  expect(lines.promise).resolves.toMatchObject({
    i: '1',
    // oxlint-disable-next-line id-length -- atc's wire names its fields p and b
    p: { b: { json: { code: 'protocol_mismatch', message: 'hq speaks protocol v12, daemon 7.1.0 speaks v11; restart the daemon so both run the same build' } } },
  });
});

test('it answers a hello on its own protocol and records it', async () => {
  const ctx = setupTest();
  const daemon = startStubAtcDaemon(ctx.path, {});
  onTestFinished(() => daemon.stop());
  const peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => peer.stop());

  expect(daemon.requests).toStrictEqual([{ method: 'daemon.hello', input: { client: 'hq', protocol: 12, auth: { scheme: 'none' } } }]);
});

test('it answers a hello on its own protocol with no peer session, as atc does for a peer outside a session', async () => {
  const ctx = setupTest();
  const daemon = startStubAtcDaemon(ctx.path, {});
  const lines = Promise.withResolvers<unknown>();
  const socket = await Bun.connect({
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

  // oxlint-disable-next-line id-length -- atc's wire names its fields i, p, u and b
  socket.write(`${JSON.stringify({ i: '1', p: { u: '/daemon/hello', b: { json: { client: 'hq', protocol: 12 } } } })}\n`);

  // oxlint-disable-next-line id-length -- atc's wire names its fields p and b
  await expect(lines.promise).resolves.toMatchObject({ i: '1', p: { b: { json: { daemon: '7.4.0', peerSession: null, features: ['events.read.from-start'] } } } });
});

test('it records each procedure it answers under its dotted method name', async () => {
  const ctx = setupTest();
  const daemon = startStubAtcDaemon(ctx.path, { 'session.list': () => ({ sessions: [] }) });
  onTestFinished(() => daemon.stop());
  const peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => peer.stop());

  await peer.send('session.list', {});

  expect(daemon.requests.map((request) => request.method)).toStrictEqual(['daemon.hello', 'session.list']);
});

test('it answers a method it does not serve as unknown_method', async () => {
  const ctx = setupTest();
  const daemon = startStubAtcDaemon(ctx.path, {});
  onTestFinished(() => daemon.stop());
  const peer = await openAtcPeer(ctx.path, 1000);
  onTestFinished(() => peer.stop());

  expect(peer.send('session.teleport', {})).rejects.toMatchObject({ code: 'atc_unknown_method' });
});
