import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { readGhJSON } from './read-gh-json.ts';

interface UsageItem {
  netAmount: number;
  product: string;
}

// The zgeoff account's GitHub Actions spend in US dollars for the UTC calendar month of `at`, the
// month GitHub billing uses. It sums netAmount, the amount GitHub bills after the included minutes
// and discounts; grossAmount also counts the free allowance, which costs nothing.
export async function readActionsSpend(run: Runner, at: Date, env?: RunOpts['env']): Promise<number> {
  const path = `users/zgeoff/settings/billing/usage?year=${at.getUTCFullYear()}&month=${at.getUTCMonth() + 1}`,
    raw = await readGhJSON(run, ['api', path], env, 'GitHub billing usage');
  if (!hasUsageItems(raw)) {
    throw new HqError('command_failed', 'GitHub billing usage: no usageItems list');
  }
  let net = 0;
  for (const item of raw.usageItems) {
    if (!isUsageItem(item)) {
      throw new HqError('command_failed', 'GitHub billing usage: an item without a product or a netAmount');
    }
    if (item.product.toLowerCase() === 'actions') {
      net += item.netAmount;
    }
  }
  return net;
}

function hasUsageItems(raw: unknown): raw is { usageItems: unknown[] } {
  return typeof raw === 'object' && raw !== null && Array.isArray((raw as { usageItems?: unknown }).usageItems);
}

function isUsageItem(item: unknown): item is UsageItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const fields = item as Partial<Record<keyof UsageItem, unknown>>;
  return typeof fields.product === 'string' && typeof fields.netAmount === 'number' && Number.isFinite(fields.netAmount);
}
