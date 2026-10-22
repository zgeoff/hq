import { z } from 'zod';

// `hq fleet --json` reports the last run's steps as .last.steps; z-steward's compact hook reads
// each step's id and name, so tell z-steward before changing them.
export const FLEET_LAST_SCHEMA = z.object({ at: z.string(), dryRun: z.boolean(), steps: z.array(
    z.object({
      name: z.string(),
      action: z.enum(['ok', 'duplicates', 'waiting', 'spawned', 'would spawn', 'failed', 'remote control']),
      detail: z.string(),
      id: z.string().optional(),
      message: z.string().optional(),
      urgent: z.boolean().optional(),
    }),
  ),
});
