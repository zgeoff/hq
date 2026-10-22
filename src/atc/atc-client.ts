// A small client for the atc daemon's protocol 6: oRPC peer messages, one JSON message per line,
// a hello first. Self-contained so hq never imports atc from source.
import type { z } from 'zod';
import { HqError } from '../errors.ts';
import { answer } from './answer.ts';
import { ATC_WRITES } from './atc-writes.ts';
import { messageSchema } from './message-schema.ts';
import { openAtcPeer } from './open-atc-peer.ts';
import type { AtcPeer } from './open-atc-peer.ts';
import { sessionListRequiredSchema } from './session-list-required-schema.ts';
import type { SessionInfo } from './session-schema.ts';
import { socketPath } from './socket-path.ts';
import { writeRefusal } from './write-refusal.ts';

export class AtcClient {
  private sessionCache: SessionInfo[] | null = null;

  private readonly peer: AtcPeer;

  private constructor(peer: AtcPeer) {
    this.peer = peer;
  }

  static async open(path = socketPath(), timeoutMs = 3000): Promise<AtcClient> {
    const peer = await openAtcPeer(path, timeoutMs);
    return new AtcClient(peer);
  }

  request(m: string, p: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const refused = ATC_WRITES.has(m) ? writeRefusal() : null;
    if (refused) return Promise.reject(new HqError('atc_write_refused', `${m} refused: ${refused}`));
    return this.peer.send(m, p);
  }

  // A request whose answer is checked at the boundary: a failure is bad_atc_answer naming the
  // method and the field.
  async call<S extends z.ZodType>(m: string, p: Record<string, unknown>, schema: S): Promise<z.output<S>> {
    return answer(m, await this.request(m, p), schema);
  }

  async sessions(): Promise<SessionInfo[]> {
    if (this.sessionCache === null) {
      const listed = await this.call('session.list', {}, sessionListRequiredSchema);
      this.sessionCache = listed.sessions;
    }
    return this.sessionCache;
  }

  // A session by id, or by name among the live ones. Refuses an ambiguous name. `known` maps a
  // fleet name to the session id hq fleet recorded: that session, when alive, wins over the name,
  // so a session renamed under hq (z-stu shown as "stu") still gets its messages.
  async resolve(target: string, known: Record<string, string> = {}): Promise<SessionInfo> {
    const all = await this.sessions();
    const kid = Object.hasOwn(known, target) ? known[target] : undefined;
    const recorded = kid ? all.find((s) => s.id === kid && s.alive) : undefined;
    if (recorded) return recorded;
    const byId = all.find((s) => s.id === target);
    if (byId) return byId;
    const live = all.filter((s) => s.alive && s.name === target);
    if (live.length === 1) return live[0]!;
    if (live.length > 1) throw new HqError('ambiguous_session', `${live.length} live sessions are named ${target}`);
    throw new HqError('no_such_session', `no live session named ${target}`);
  }

  async message(session: string, text: string, from: string, idempotencyKey: string): Promise<string | undefined> {
    // notice false: no answer notice comes back to any session. The send stays detached so the sender label is the local 'hq'.
    const reply = await this.call('session.message', { session, text, from, idempotencyKey, notice: false }, messageSchema);
    return reply.message;
  }

  close(): void {
    this.peer.stop();
  }
}
