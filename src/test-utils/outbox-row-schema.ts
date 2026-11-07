import { z } from 'zod';

// The columns a test reads back when it checks who was messaged and with what.
export const OutboxMessageSchema = z.object({ target: z.string(), text: z.string() });

// The columns a test reads back from the outbox when it checks what was queued.
export const OutboxRowSchema = z.object({ target: z.string(), text: z.string(), status: z.string(), topic: z.string() });
