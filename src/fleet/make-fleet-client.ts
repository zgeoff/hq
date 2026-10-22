import { z } from 'zod';
import type { AtcClient } from '../atc/atc-client.ts';
import { messageGetSchema } from '../atc/message-get-schema.ts';
import { sessionGetSchema } from '../atc/session-get-schema.ts';
import { sessionListRequiredSchema } from '../atc/session-list-required-schema.ts';
import { sessionSpawnSchema } from '../atc/session-spawn-schema.ts';
import { HqError } from '../errors.ts';
import type { FleetClient } from './types.ts';

const forgetSchema = z.looseObject({
  forgotten: z.boolean().optional(),
  confirmToken: z.string().optional(),
});

export function makeFleetClient(c: AtcClient): FleetClient {
  return {
    sessions: async () => {
      const listed = await c.call('session.list', {}, sessionListRequiredSchema);

      // no ?? []: a bad answer must spawn nothing
      return listed.sessions;
    },
    spawn: async (p) => {
      const r = await c.call('session.spawn', { ...p }, sessionSpawnSchema);
      if (!r.session?.id) {
        throw new HqError('spawn_failed', 'atc answered the spawn without a session id');
      }
      return { id: r.session.id };
    },
    pin: async (id) => void (await c.request('session.update', { session: id, pinned: true })),
    submit: async (id, text) => void (await c.request('session.submit', { session: id, text })),
    details: async (id) => {
      const got = await c.call('session.get', { session: id }, sessionGetSchema);
      return { prompt: got.prompt, lastActivityAt: got.lastActivityAt };
    },
    message: (id) => c.call('message.get', { message: id }, messageGetSchema),
    kill: async (id) => void (await c.request('session.kill', { session: id, stopOnly: true })),
    unpin: async (id) => void (await c.request('session.update', { session: id, pinned: false })),
    forget: async (id, confirmToken) => {
      const params = confirmToken === undefined ? { session: id, refusePinned: true } : { session: id, refusePinned: true, confirmToken };
      const got = await c.call('session.forget', params, forgetSchema);
      return { forgotten: got.forgotten === true, confirmToken: got.confirmToken };
    },
  };
}
