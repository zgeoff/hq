import type { RefusedFinal } from './types.ts';

// What a refused FINAL says, for the agent that gave it.
export function formatFinalRefusal(ref: string, given: string, refusal: RefusedFinal): string {
  if (refusal.reason === 'ambiguous') {
    return `the FINAL names ${given}, which matches ${refusal.shas.length} commits of zgeoff/${ref}: ${refusal.shas.join(', ')} - this sha is ambiguous, send the FINAL again with a longer sha`;
  }
  const head = refusal.head === null ? '' : `; its head is ${refusal.head.slice(0, 8)} - send the FINAL again at that sha`;
  return `the FINAL names ${given}, which is no commit of zgeoff/${ref}${head}`;
}
