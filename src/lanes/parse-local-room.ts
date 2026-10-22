import { z } from 'zod';
import { HqError } from '../errors.ts';

const providerSchema = z.object({ unattended: z.boolean().optional(), target: z.string().optional(), localFallback: z.number().int().nonnegative().optional() });

const fileSchema = z.object({ providers: z.record(z.string(), providerSchema).optional() });

// The local sessions pacing.json's unattended providers may run on this host: each one's
// localFallback summed, or null, no cap but the local size, when one targets local or the file lists
// no providers. A provider that is not unattended never starts lane work, so its localFallback is
// left out. Providers it cannot read throw.
export function parseLocalRoom(raw: unknown): number | null {
  const file = fileSchema.safeParse(raw);
  if (!file.success) {
    throw new HqError('no_lanes', 'pacing.json providers: give each provider unattended true|false, a target, and a whole localFallback of 0 or more');
  }
  const providers = Object.values(file.data.providers ?? {});
  const unattended = providers.filter((provider) => provider.unattended === true);
  if (providers.length === 0 || unattended.some((provider) => provider.target === 'local')) {
    return null;
  }
  return unattended.reduce((sum, provider) => sum + (provider.localFallback ?? 0), 0);
}
