import { z } from 'zod';
import { HqError } from '../errors.ts';

const providerSchema = z.object({ unattended: z.boolean().optional(), target: z.string().optional(), localFallback: z.number().int().nonnegative().optional() });

const fileSchema = z.object({ providers: z.record(z.string(), providerSchema).optional() });

// The local sessions pacing.json's unattended providers may run on this host, their localFallback
// summed; null (no cap but the local size) when one targets local or none is listed. capacity.sh
// never launches route work on a provider that is not unattended, so its localFallback is left out.
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
