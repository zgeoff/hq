import { ORPCError } from '@orpc/client';
import { StandardRPCJsonSerializer, StandardRPCSerializer } from '@orpc/client/standard';
import { os } from '@orpc/server';
import { StandardRPCCodec, StandardRPCHandler } from '@orpc/server/standard';
import { ServerPeer } from '@orpc/standard-server-peer';
import type { ServerPeerHandleRequestFn } from '@orpc/standard-server-peer';
import type { SocketHandler } from 'bun';
import { z } from 'zod';

export type StubProcedure = (input: unknown) => unknown;

interface StubAtcRequest {
  method: string;
  input: unknown;
}

export interface StubAtcDaemon {
  path: string;
  requests: StubAtcRequest[];
  stop: () => void;
}

export interface StubAtcOptions {
  build?: string;
  protocol?: number;
}

interface Connection {
  decoder: TextDecoder;
  pending: string;
  peer: ServerPeer;
}

interface DaemonIdentity {
  build: string;
  protocol: number;
}

type PeerRequest = Parameters<ServerPeerHandleRequestFn>[0];

const CODEC = new StandardRPCCodec(new StandardRPCSerializer(new StandardRPCJsonSerializer()));

// A daemon on a unix socket that speaks atc's protocol 8 peer wire: one JSON message per line, the
// hello first, a refusal under {code, message, data}. It answers each procedure in `procedures`
// (keyed by the dotted method name) and refuses any other as unknown_method. The caller stops it.
export function startStubAtcDaemon(path: string, procedures: Record<string, StubProcedure>, options: StubAtcOptions = {}): StubAtcDaemon {
  const requests: StubAtcRequest[] = [],
    server = Bun.listen<Connection>({ unix: path, socket: buildHandlers(procedures, requests, options) });
  return { path, requests, stop: () => server.stop(true) };
}

function buildHandlers(procedures: Record<string, StubProcedure>, requests: StubAtcRequest[], options: StubAtcOptions): SocketHandler<Connection> {
  const daemon: DaemonIdentity = { build: options.build ?? '7.0.0', protocol: options.protocol ?? 8 },
    router = buildRouter(procedures, requests, daemon);
  return {
    open(socket) {
      const peer = new ServerPeer((message) => {
        socket.write(`${String(message)}\n`);
      });
      socket.data = { decoder: new TextDecoder(), pending: '', peer };
    },
    data(socket, chunk) {
      const conn = socket.data,
        lines = `${conn.pending}${conn.decoder.decode(chunk, { stream: true })}`.split('\n');
      conn.pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          void conn.peer.message(line, (request) => runPeerRequest(request, router));
        }
      }
    },
  };
}

async function runPeerRequest(request: PeerRequest, router: ReturnType<typeof buildRouter>): ReturnType<ServerPeerHandleRequestFn> {
  const handled = await new StandardRPCHandler(router, {}).handle({ ...request, body: () => Promise.resolve(request.body) }, { context: {} });
  if (handled.response) {
    return handled.response;
  }
  return CODEC.encodeError(new ORPCError('unknown_method', { message: `unknown method '${request.url.pathname}'` }));
}

function buildRouter(procedures: Record<string, StubProcedure>, requests: StubAtcRequest[], daemon: DaemonIdentity) {
  const all: Record<string, StubProcedure> = { ...procedures, 'daemon.hello': (input) => buildHelloResult(input, daemon) },
    router: Record<string, Record<string, ReturnType<typeof buildProcedure>>> = {};
  for (const [method, run] of Object.entries(all)) {
    const [noun = '', verb = ''] = method.split('.');
    router[noun] ??= {};
    router[noun][verb] = buildProcedure(method, run, requests);
  }
  return router;
}

function buildProcedure(method: string, run: StubProcedure, requests: StubAtcRequest[]) {
  return os.handler((options) => {
    requests.push({ method, input: options.input });
    return run(options.input);
  });
}

function buildHelloResult(input: unknown, daemon: DaemonIdentity) {
  const hello = z.looseObject({ client: z.string().default('unknown client'), protocol: z.number().optional() }).parse(input);
  if (hello.protocol !== daemon.protocol) {
    throw new ORPCError('protocol_mismatch', {
      message: `${hello.client} speaks protocol v${hello.protocol ?? 'unknown'}, daemon ${daemon.build} speaks v${daemon.protocol}; restart the daemon so both run the same build`,
    });
  }
  return { daemon: daemon.build, daemonID: 'd-invented', limits: { maxLine: 1_048_576, maxChunk: 65_536 }, idempotency: { completedRetentionMs: 86_400_000 }, lastUsedAgent: 'claude' };
}
