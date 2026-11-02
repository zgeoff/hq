import { z } from 'zod';

export const BROKER_META = 'imp_broker';

export const BrokerRecordSchema = z.object({
  slot: z.number().int().min(1).max(4),
  proof: z.string().min(1),
  note: z.string().nullable(),
  at: z.string(),
  by: z.string(),
});

export type BrokerRecord = z.output<typeof BrokerRecordSchema>;
