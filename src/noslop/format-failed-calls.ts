import { z } from 'zod';

const FailedCallSchema = z.object({ id: z.string().optional(), reason: z.string().optional() });

const NO_TEXT = 'noslop gave no error text';

export function formatFailedCalls(failedCalls: readonly unknown[]): string {
  const reasons = new Map<string, string[]>();
  for (const raw of failedCalls) {
    const parsed = FailedCallSchema.safeParse(raw);
    const call = parsed.success ? parsed.data : {};
    const reason = formatReason(call.reason);
    reasons.set(reason, [...(reasons.get(reason) ?? []), call.id ?? 'unnamed']);
  }
  const said = [...reasons].map(([reason, ids]) => `${reason} (${ids.join(', ')})`).join('; ');
  return `${failedCalls.length} noslop call(s) failed: ${said}`;
}

// noslop's codex adapter reports only stderr, so a refusal codex prints elsewhere, such as its
// usage limit, arrives as "codex exited 1 on call <id>: " with nothing after the colon.
function formatReason(reason: string | undefined): string {
  if (reason === undefined || reason.trim() === '') {
    return NO_TEXT;
  }
  const generic = reason.replace(/ on call \S+:\s*/u, ': ').trim();
  return generic.endsWith(':') ? `${generic} ${NO_TEXT}` : generic;
}
