import { z } from 'zod';
import { readyIssueSchema } from './ready-snapshot.ts';

export const DESIGN_BACKLOG = z.object({ at: z.string(), agent: z.array(readyIssueSchema), withGeoff: z.array(readyIssueSchema) }).nullable();

export const DESIGN_BACKLOG_KEY = 'lanes_design_backlog';

export type DesignBacklog = NonNullable<z.output<typeof DESIGN_BACKLOG>>;
