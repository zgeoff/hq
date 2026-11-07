import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { readGhJSON } from './read-gh-json.ts';

const UsageSchema = z.object({ usageItems: z.array(z.unknown()) });
const UsageItemSchema = z.object({ netAmount: z.number().finite(), product: z.string() });

// GitHub billing uses the UTC calendar month. netAmount is the amount GitHub bills after the included
// minutes and discounts; grossAmount also counts the free allowance, which costs nothing.
export async function readActionsSpend(run: Runner, at: Date, env?: RunOpts['env']): Promise<number> {
  const path = `users/zgeoff/settings/billing/usage?year=${at.getUTCFullYear()}&month=${at.getUTCMonth() + 1}`;
  const body = await readGhJSON(run, ['api', path], env, 'GitHub billing usage');
  const usage = UsageSchema.safeParse(body);
  if (!usage.success) {
    throw new HqError('command_failed', 'GitHub billing usage: no usageItems list');
  }
  let net = 0;
  for (const raw of usage.data.usageItems) {
    const item = UsageItemSchema.safeParse(raw);
    if (!item.success) {
      throw new HqError('command_failed', 'GitHub billing usage: an item without a product or a netAmount');
    }
    if (item.data.product.toLowerCase() === 'actions') {
      net += item.data.netAmount;
    }
  }
  return net;
}
