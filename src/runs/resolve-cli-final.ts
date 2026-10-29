import { buildFinalKey } from './build-final-key.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { SHA } from './sha.ts';
import type { FinalClaim, FinalResolution, FinalResolutions } from './types.ts';

export async function resolveCliFinal(resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>, raw: string, sha: string): Promise<FinalResolution | null> {
  if (!SHA.test(sha)) {
    return null;
  }
  const ref = normalizePrRef(raw).ref;
  const resolutions = await resolveFinal([{ ref, sha }]);
  return resolutions.get(buildFinalKey(ref, sha)) ?? null;
}
