import { normalizePrRef } from './normalize-pr-ref.ts';
import { PR_IN_TEXT } from './pr-in-text.ts';

export function collectMentionedPRs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(PR_IN_TEXT)) {
    try {
      refs.add(normalizePrRef(m[0]).ref);
    } catch {}
  }
  return [...refs];
}
