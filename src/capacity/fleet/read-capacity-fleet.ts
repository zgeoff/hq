import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { readFleetView } from './read-fleet-view.ts';
import { runFleetStep } from './run-fleet-step.ts';
import type { FleetIO, FleetView } from './types.ts';

export async function readCapacityFleet(db: Database, io: FleetIO, at: Date, refresh: boolean): Promise<{ view: FleetView; problems: string[] }> {
  if (!refresh) {
    return { view: await readFleetView(db, io, at), problems: [] };
  }
  const step = await runFleetStep(db, io, at, { force: true, signal: new AbortController().signal });
  const problems = match(step.read)
    .with(null, () => [])
    .with({ kind: 'not-set-up' }, () => [])
    .with({ kind: 'read' }, (done) => done.problems)
    .exhaustive();

  return { view: step.view, problems };
}
