import { buildFinalKey } from './build-final-key.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { SHA } from './sha.ts';
import type { FinalClaim, FinalResolution, FinalResolutions } from './types.ts';

// What GitHub says of the sha `hq run final` was given; null for a sha that is no hex sha, which
// the command refuses on its own.
export async function resolveCliFinal(resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>, raw: string, sha: string): Promise<FinalResolution | null> {
  if (!SHA.test(sha)) {
    return null;
  }
  const ref = normalizePrRef(raw).ref;
  const resolutions = await resolveFinal([{ ref, sha }]);
  return resolutions.get(buildFinalKey(ref, sha)) ?? null;
}
