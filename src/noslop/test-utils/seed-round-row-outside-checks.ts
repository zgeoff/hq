import type { NoslopDeps } from './types.ts';

interface RoundRowValues {
  kind: string;
  ok: number;
  full: number | null;
}

export function seedRoundRowOutsideChecks(deps: NoslopDeps, input: Partial<RoundRowValues> = {}): void {
  const values: RoundRowValues = { kind: 'review', ok: 1, full: null, ...input };

  // A round row with a kind, ok flag or full flag that the table's CHECK constraints refuse: recordRound's types never let one reach the table.
  deps.db
    .query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha, full) VALUES ('widgets', 7, ?, 'a', 'b', 1, ?, 'x', ?)")
    .run(values.kind, values.ok, values.full);
}
