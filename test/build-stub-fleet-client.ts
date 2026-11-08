import type { FleetClient, FleetSession, StaleOps } from '../src/fleet/types.ts';

type ForgetAnswer = Awaited<ReturnType<StaleOps['forget']>>;

export interface StubFleetAnswers {
  sessions: FleetSession[];

  forgets?: Record<string, ForgetAnswer[]>;

  killFailures?: string[];

  // A forget answers once this settles, so a test can hold a caller part-way through.
  forgetAfter?: Promise<unknown>;
}

export interface StubFleetClient {
  client: FleetClient & StaleOps;
  calls: string[];
}

export function buildStubFleetClient(answers: StubFleetAnswers): StubFleetClient {
  const calls: string[] = [];

  // Each session's answers are copied on its first forget, so a test can script them after the build.
  const forgets = new Map<string, ForgetAnswer[]>();
  const readNextForget = (id: string) => {
    const left = forgets.get(id) ?? [...(answers.forgets?.[id] ?? [])];
    forgets.set(id, left);
    return left.shift() ?? { forgotten: true };
  };
  const record = (verb: string, id: string) => {
    calls.push(`${verb} ${id.slice(0, 8)}`);
    return Promise.resolve();
  };
  const client: FleetClient & StaleOps = {
    sessions: () => Promise.resolve(answers.sessions),
    spawn: () => Promise.reject(new Error('the stub fleet client spawns nothing')),
    details: () => Promise.reject(new Error('the stub fleet client reads no details')),
    message: () => Promise.reject(new Error('the stub fleet client reads no message')),
    pin: (id) => record('pin', id),
    kill: (id) => {
      calls.push(`kill ${id.slice(0, 8)}`);
      if (answers.killFailures?.includes(id) === true) {
        return Promise.reject(new Error('atc did not answer session.kill'));
      }
      return Promise.resolve();
    },
    unpin: (id) => record('unpin', id),
    forget: async (id, confirmToken) => {
      calls.push(`forget ${id.slice(0, 8)}${confirmToken === undefined ? '' : ` ${confirmToken}`}`);
      await answers.forgetAfter;
      return readNextForget(id);
    },
    forgetLive: (id, confirmToken) => {
      calls.push(`forget-live ${id.slice(0, 8)}${confirmToken === undefined ? '' : ` ${confirmToken}`}`);
      return Promise.resolve(readNextForget(id));
    },
  };
  return { client, calls };
}
