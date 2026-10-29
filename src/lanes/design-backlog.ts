import { z } from 'zod';
import { readyIssueSchema } from './ready-snapshot.ts';

// The last Backlog read's needs-design issues, by design queue, with the time of the read.
export const DESIGN_BACKLOG = z.object({ at: z.string(), agent: z.array(readyIssueSchema), withGeoff: z.array(readyIssueSchema) }).nullable();

export const DESIGN_BACKLOG_KEY = 'lanes_design_backlog';

export type DesignBacklog = NonNullable<z.output<typeof DESIGN_BACKLOG>>;
