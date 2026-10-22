import type { FleetClient, FleetSession, StaleOps } from '../src/fleet/types.ts';

type ForgetAnswer = Awaited<ReturnType<StaleOps['forget']>>;

export interface StubFleetAnswers {
  sessions: FleetSession[];

  // per session id, what its forget calls answer in turn; a forget past the list forgets the session
  forgets?: Record<string, ForgetAnswer[]>;
  pinFailures?: string[]; // session ids whose pin atc refuses
}

export interface StubFleetClient {
  client: FleetClient & StaleOps;
  calls: string[]; // each pin, unpin, kill and forget in order, as `<verb> <first 8 of the id>[ <token>]`
}

// An atc fleet client that lists the given sessions and answers the wrap-up's session operations.
// It spawns and reads nothing.
export function buildStubFleetClient(answers: StubFleetAnswers): StubFleetClient {
  const calls: string[] = [];
  const forgets = new Map(Object.entries(answers.forgets ?? {}).map(([id, list]) => [id, [...list]]));
  const record = (verb: string, id: string) => {
    calls.push(`${verb} ${id.slice(0, 8)}`);
    return Promise.resolve();
  };
  const client: FleetClient & StaleOps = {
    sessions: () => Promise.resolve(answers.sessions),
    spawn: () => Promise.reject(new Error('the stub fleet client spawns nothing')),
    details: () => Promise.reject(new Error('the stub fleet client reads no details')),
    message: () => Promise.reject(new Error('the stub fleet client reads no message')),
    pin: (id) => {
      calls.push(`pin ${id.slice(0, 8)}`);
      if (answers.pinFailures?.includes(id) === true) {
        return Promise.reject(new Error('atc refused the pin'));
      }
      return Promise.resolve();
    },
    kill: (id) => record('kill', id),
    unpin: (id) => record('unpin', id),
    forget: (id, confirmToken) => {
      calls.push(`forget ${id.slice(0, 8)}${confirmToken === undefined ? '' : ` ${confirmToken}`}`);
      return Promise.resolve(forgets.get(id)?.shift() ?? { forgotten: true });
    },
  };
  return { client, calls };
}
