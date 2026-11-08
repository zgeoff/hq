import { z } from 'zod';

export const StoredEventSchema = z.object({ seq: z.number(), action: z.string(), actor: z.string(), at: z.string(), data: z.string() });

export type StoredEvent = z.infer<typeof StoredEventSchema>;
