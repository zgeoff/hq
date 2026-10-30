export interface RunFacts {
  workflow: string;
  name: string;
  url: string | null | undefined;
  startedAt: string | null | undefined;
  cancelled: boolean;
  passing: boolean;
}

interface Attempt {
  started: number;
  passing: boolean;
}

interface Run {
  workflow: string;
  id: number;
  firstStart: number | null;
  newest: Map<string, Attempt>;
}

// A stack push starts 2 runs of one workflow on one head, and its concurrency group cancels the
// first. A cancelled check drops out when it started before a later run of the same workflow that
// passed. Every other check stays: a real failure, and a re-run that starts after the later run.
export function pickCountedChecks<T>(checks: readonly T[], describe: (check: T) => RunFacts): T[] {
  const runs = new Map<string, Run>();
  for (const check of checks) {
    const facts = describe(check);
    const id = parseRunID(facts.url);
    if (id !== null) {
      const key = `${facts.workflow}\0${id}`;
      const held = runs.get(key) ?? { workflow: facts.workflow, id, firstStart: null, newest: new Map<string, Attempt>() };
      const started = parseTime(facts.startedAt);
      const attempt = held.newest.get(facts.name);
      if (attempt === undefined || (started ?? 0) >= attempt.started) {
        held.newest.set(facts.name, { started: started ?? 0, passing: facts.passing });
      }
      runs.set(key, { ...held, firstStart: pickEarlier(held.firstStart, started) });
    }
  }
  const passed = [...runs.values()].filter((run) => [...run.newest.values()].every((attempt) => attempt.passing));
  return checks.filter((check) => {
    const facts = describe(check);
    const id = parseRunID(facts.url);
    const started = parseTime(facts.startedAt);
    return !facts.cancelled || id === null || started === null || !passed.some((later) => later.workflow === facts.workflow && later.id > id && later.firstStart !== null && started < later.firstStart);
  });
}

const RUN_ID = /\/actions\/runs\/(?<id>\d+)(?:\/|$)/u;

function parseRunID(url: string | null | undefined): number | null {
  const found = url === null || url === undefined ? null : RUN_ID.exec(url);
  const id = found?.groups?.['id'];
  return id === undefined ? null : Number(id);
}

function parseTime(at: string | null | undefined): number | null {
  const parsed = at === null || at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(parsed) ? null : parsed;
}

function pickEarlier(first: number | null, second: number | null): number | null {
  if (first === null || second === null) {
    return first ?? second;
  }
  return Math.min(first, second);
}
