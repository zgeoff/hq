import { z } from 'zod';

export const EXCHANGE_PATH = '/auth/exchange';

export const ExchangeRequestSchema = z.object({ token: z.string() });

export const ExchangeReplySchema = z.object({ session: z.string() });

export type ExchangeRequest = z.infer<typeof ExchangeRequestSchema>;
