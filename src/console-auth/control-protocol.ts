import { z } from 'zod';

// The requests the console's control socket takes and the replies it gives, each one JSON line.
// No reply carries a link.
export const ControlRequestSchema = z.object({ request: z.literal('login') });

export const ControlReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('printed') }),
  z.object({ status: z.literal('refused'), reason: z.string() }),
  z.object({ status: z.literal('unknown-request') }),
]);

export type ControlRequest = z.infer<typeof ControlRequestSchema>;

export type ControlReply = z.infer<typeof ControlReplySchema>;

// One message as the line the socket carries.
export function encodeControlLine(message: ControlRequest | ControlReply): string {
  return `${JSON.stringify(message)}\n`;
}
