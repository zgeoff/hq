import { z } from 'zod';

export const ControlRequestSchema = z.object({ request: z.literal('login') });

export const ControlReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('printed') }),
  z.object({ status: z.literal('refused'), reason: z.string() }),
  z.object({ status: z.literal('unknown-request') }),
]);

export type ControlRequest = z.infer<typeof ControlRequestSchema>;

export type ControlReply = z.infer<typeof ControlReplySchema>;

export function encodeControlLine(message: ControlRequest | ControlReply): string {
  return `${JSON.stringify(message)}\n`;
}
