export interface RunFacts {
  workflow: string;
  url: string | null | undefined;
  startedAt: string | null | undefined;
  cancelled: boolean;
  passing: boolean;
}

interface Run {
  workflow: string;
  id: number;
  cancelled: boolean;
  passed: boolean;
  firstStart: number | null;
}

// A stack push starts 2 runs of one workflow on one head, and its concurrency group cancels the
// first. A check of a cancelled run drops out when it started before a later run of the same
// workflow that passed; a re-run of the cancelled run starts after, so it still counts.
export function pickCountedChecks<T>(checks: readonly T[], describe: (check: T) => RunFacts): T[] {
  const runs = new Map<string, Run>();
  for (const check of checks) {
    const facts = describe(check);
    const id = parseRunID(facts.url);
    if (id !== null) {
      const key = `${facts.workflow}\0${id}`;
      const held = runs.get(key) ?? { workflow: facts.workflow, id, cancelled: false, passed: true, firstStart: null };
      runs.set(key, { ...held, cancelled: held.cancelled || facts.cancelled, passed: held.passed && facts.passing, firstStart: pickEarlier(held.firstStart, parseTime(facts.startedAt)) });
    }
  }
  const passed = [...runs.values()].filter((run) => run.passed);
  return checks.filter((check) => {
    const facts = describe(check);
    const id = parseRunID(facts.url);
    const run = id === null ? undefined : runs.get(`${facts.workflow}\0${id}`);
    const started = parseTime(facts.startedAt);
    return run?.cancelled !== true || started === null || !passed.some((later) => later.workflow === run.workflow && later.id > run.id && later.firstStart !== null && started < later.firstStart);
  });
}

const RUN_ID = /\/actions\/runs\/(?<id>\d+)(?:\/|$)/u;

function parseRunID(url: string | null | undefined): number | null {
  const found = url === null || url === undefined ? null : RUN_ID.exec(url);
  const id = found?.groups?.['id'];
  return id === undefined ? null : Number(id);
}

function pickEarlier(first: number | null, second: number | null): number | null {
  if (first === null || second === null) {
    return first ?? second;
  }
  return Math.min(first, second);
}

function parseTime(at: string | null | undefined): number | null {
  const parsed = at === null || at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(parsed) ? null : parsed;
}
