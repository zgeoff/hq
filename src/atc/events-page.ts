import { z } from 'zod';

// The paging fields every events.read answer carries.
export const eventsPage = { cursor: z.string(), more: z.boolean() };
