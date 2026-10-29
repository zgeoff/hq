import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import type { DesignRun } from './read-design-runs.ts';

const eventsSchema = z.array(z.object({ subject_id: z.string(), data: z.string() }));

const dataSchema = z.object({ asked: z.string().nullish() });

// Where the owner asked for each open with-geoff pass added with --asked, in the order they were added.
export function readDesignAsked(db: Database, designRuns: readonly DesignRun[]): string[] {
  const open = new Set(
    designRuns
      .filter((run) => run.lane === 'with-geoff' && !CLOSED_RUN_STATES.includes(run.state))
      .map((run) => run.issue),
  );
  if (open.size === 0) {
    return [];
  }
  const events = eventsSchema.parse(db.query(`SELECT subject_id, data FROM events WHERE subject = 'run' AND action IN ('added', 'design-asked') AND subject_id IN (${[...open].map(() => '?').join(', ')}) ORDER BY seq`).all(...open));
  return events.flatMap((event) => dataSchema.parse(JSON.parse(event.data)).asked ?? []);
}
