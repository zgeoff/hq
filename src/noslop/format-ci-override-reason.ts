export interface CIOverrideUse {
  check: string;
  source: string;
}

export function formatCIOverrideReason(reason: string, sha7: string, used: readonly CIOverrideUse[]): string {
  if (used.length === 0) {
    return reason;
  }
  const phrase = used.map((override) => `${override.check} overridden by the owner (${override.source})`).join(', ');
  return reason.endsWith(`CI green at ${sha7}`) ? `${reason} with ${phrase}` : `${reason}; CI check ${phrase}`;
}
