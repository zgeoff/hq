import { z } from 'zod';
import { eventsPage } from './events-page.ts';

export const eventsReadSchema = z.looseObject({
  ...eventsPage,
  events: z.array(z.looseObject({ cursor: z.string(), at: z.number(), session: z.string(), name: z.string().nullable(), kind: z.string(), detail: z.string().nullable(), label: z.string().optional() })),
});
