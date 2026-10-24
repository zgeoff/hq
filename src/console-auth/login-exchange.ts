import { z } from 'zod';

// The page swaps a login token for a console session here: one shape for the server and the page.
export const EXCHANGE_PATH = '/auth/exchange';

export const ExchangeRequestSchema = z.object({ token: z.string() });

export const ExchangeReplySchema = z.object({ session: z.string() });

export type ExchangeRequest = z.infer<typeof ExchangeRequestSchema>;
