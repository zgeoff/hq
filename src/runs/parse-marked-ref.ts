import { normalizePRRef } from './normalize-pr-ref.ts';

export function parseMarkedRef(raw: string): string | null {
  try {
    return normalizePRRef(raw).ref;
  } catch {
    return null;
  }
}
