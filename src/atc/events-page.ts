import { z } from 'zod';

export const eventsPage = { cursor: z.string(), more: z.boolean() };
