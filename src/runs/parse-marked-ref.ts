import { normalizePrRef } from './normalize-pr-ref.ts';

export function parseMarkedRef(raw: string): string | null {
  try {
    return normalizePrRef(raw).ref;
  } catch {
    return null;
  }
}
