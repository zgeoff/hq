import { StandardRPCLink } from '@orpc/client/standard';
import type { StandardLinkClient } from '@orpc/client/standard';
import { ClientPeer } from '@orpc/standard-server-peer';
import type { Socket, SocketHandler } from 'bun';
import { HqError } from '../errors.ts';
import { buildOutboundQueue } from './build-outbound-queue.ts';
import type { OutboundQueue } from './build-outbound-queue.ts';
import { buildOlderProtocolError } from './build-older-protocol-error.ts';
import { PROTOCOL_V } from './protocol-v.ts';
import { toHqError } from './to-hq-error.ts';
import { withTimeout } from './with-timeout.ts';

export interface AtcPeer {
  send: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  stop: () => void;
  peerSession: string | null | undefined;
}

type PeerRequest = Parameters<StandardLinkClient<object>['call']>[0];

interface PeerState {
  closedReason: string | null;
  decoder: TextDecoder;
  helloAnswered: boolean;
  inbound: Promise<void>;
  link: StandardRPCLink<object>;
  peer: ClientPeer;
  pending: string;
  queue: OutboundQueue | null;
  socket: Socket<unknown> | null;
}

// atc's wire: oRPC peer messages, one JSON message per line, over the daemon's unix socket. The
// hello goes first. A daemon on another protocol refuses it with protocol_mismatch; an older
// line-protocol daemon answers in its own frame or closes with no answer.
export async function openAtcPeer(path: string, timeoutMs: number): Promise<AtcPeer> {
  const state = buildPeerState();
  state.socket = await withTimeout(Bun.connect({ unix: path, socket: buildHandlers(state) }), timeoutMs, `atc daemon not reachable at ${path}`);
  state.queue = buildOutboundQueue(state.socket);
  let hello: Record<string, unknown>;
  try {
    hello = await sendCall(state, 'daemon.hello', { client: 'hq', protocol: PROTOCOL_V, auth: { scheme: 'none' } }, timeoutMs);
  } catch (error) {
    stopPeer(state, 'hello failed', toHqError(error));
    throw error;
  }
  state.helloAnswered = true;
  return {
    send: (method, params) => sendCall(state, method, params, timeoutMs),
    stop: () => stopPeer(state, 'client closed', new HqError('atc_unreachable', 'client closed')),
    peerSession: findPeerSession(hello),
  };
}

function buildPeerState(): PeerState {
  const state: PeerState = {
    closedReason: null,
    decoder: new TextDecoder(),
    helloAnswered: false,
    inbound: Promise.resolve(),
    link: new StandardRPCLink({ call: (request) => sendRequest(state, request) }, { url: 'http://orpc' }),
    peer: new ClientPeer((message) => writeFrame(state, message)),
    pending: '',
    queue: null,
    socket: null,
  };
  return state;
}

function buildHandlers(state: PeerState): SocketHandler {
  return {
    data(_socket, chunk) {
      readChunk(state, chunk);
    },
    drain() {
      state.queue?.drain();
    },
    close() {
      void stopAfterInbound(state);
    },
    error(_socket, error) {
      stopPeer(state, String(error), new HqError('atc_unreachable', String(error)));
    },
  };
}

function writeFrame(state: PeerState, message: unknown): void {
  if (typeof message !== 'string' || !state.queue) {
    throw new HqError('atc_unreachable', 'atc connection is not writable');
  }
  state.queue.send(`${message}\n`);
}

async function sendRequest(state: PeerState, request: PeerRequest) {
  const response = await state.peer.request(request);
  return { ...response, body: () => Promise.resolve(response.body) };
}

async function sendCall(state: PeerState, method: string, params: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
  if (state.closedReason) {
    throw new HqError('atc_unreachable', state.closedReason);
  }
  const controller = new AbortController();
  try {
    const answer: unknown = await withTimeout(state.link.call(method.split('.'), params, { context: {}, signal: controller.signal }), timeoutMs, `atc did not answer ${method}`);
    return toRecord(answer);
  } catch (error) {
    controller.abort();
    throw toHqError(error);
  }
}

function readChunk(state: PeerState, chunk: Uint8Array): void {
  const lines = `${state.pending}${state.decoder.decode(chunk, { stream: true })}`.split('\n');
  state.pending = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim()) {
      readLine(state, line);
    }
  }
}

function readLine(state: PeerState, line: string): void {
  if (isLineProtocolFrame(line)) {
    stopPeer(state, 'the daemon speaks an older protocol', buildOlderProtocolError());
    return;
  }
  state.inbound = readAfter(state, state.inbound, line);
}

async function readAfter(state: PeerState, previous: Promise<void>, line: string): Promise<void> {
  await previous;
  try {
    await state.peer.message(line);
  } catch {
    state.socket?.end();
  }
}

// The lines that arrived before the close settle their requests first, so a refusal the daemon
// wrote before it ended reaches its caller.
async function stopAfterInbound(state: PeerState): Promise<void> {
  await state.inbound;
  const error = state.helloAnswered ? new HqError('atc_unreachable', 'connection closed') : buildOlderProtocolError();
  stopPeer(state, 'connection closed', error);
}

function stopPeer(state: PeerState, reason: string, error: HqError): void {
  state.closedReason ??= reason;
  state.socket?.end();
  state.peer.close({ reason: error });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function findPeerSession(hello: Record<string, unknown>): string | null | undefined {
  const value = hello['peerSession'];
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
}

// A daemon on the older line protocol frames with a version and no peer message id.
function isLineProtocolFrame(line: string): boolean {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === 'object' && parsed !== null && 'v' in parsed && !('i' in parsed);
  } catch {
    return false;
  }
}
