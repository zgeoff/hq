import { z } from 'zod';

// A project's issues as the Shipped tab keeps them, each with its state type, for the burndown.
export const projectIssuesSchema = z.array(z.object({ id: z.string(), statusType: z.string(), project: z.string().nullable() }));
