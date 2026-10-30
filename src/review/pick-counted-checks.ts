export interface RunFacts {
  workflow: string;
  url: string | null | undefined;
  cancelled: boolean;
  passing: boolean;
}

interface Run {
  workflow: string;
  id: number;
  cancelled: boolean;
  passed: boolean;
}

// A stack push starts 2 runs of one workflow on one head, and its concurrency group cancels the
// first. Every check of a cancelled run drops out once a later run of the same workflow passed;
// otherwise it counts, as does a check that names no Actions run.
export function pickCountedChecks<T>(checks: readonly T[], describe: (check: T) => RunFacts): T[] {
  const runs = new Map<string, Run>();
  for (const check of checks) {
    const facts = describe(check);
    const id = parseRunID(facts.url);
    if (id !== null) {
      const key = `${facts.workflow}\0${id}`;
      const held = runs.get(key) ?? { workflow: facts.workflow, id, cancelled: false, passed: true };
      runs.set(key, { ...held, cancelled: held.cancelled || facts.cancelled, passed: held.passed && facts.passing });
    }
  }
  const passed = [...runs.values()].filter((run) => run.passed);
  return checks.filter((check) => {
    const facts = describe(check);
    const id = parseRunID(facts.url);
    const run = id === null ? undefined : runs.get(`${facts.workflow}\0${id}`);
    return run?.cancelled !== true || !passed.some((later) => later.workflow === run.workflow && later.id > run.id);
  });
}

const RUN_ID = /\/actions\/runs\/(?<id>\d+)(?:\/|$)/u;

function parseRunID(url: string | null | undefined): number | null {
  const found = url === null || url === undefined ? null : RUN_ID.exec(url);
  const id = found?.groups?.['id'];
  return id === undefined ? null : Number(id);
}
