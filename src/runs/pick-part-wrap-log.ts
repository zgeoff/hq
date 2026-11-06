export interface PartWrapLog {
  lines: string[];
  fingerprint: string | null;
}

// A retry that keeps a session for the same reasons as the last sweep logs nothing, so a stuck
// wrap-up shows once per change of reason. A done wrap-up always logs what it kept.
export function pickPartWrapLog(lines: readonly string[], kind: 'done' | 'retry', previous: string | null): PartWrapLog {
  if (kind === 'done') {
    return { lines: [...lines], fingerprint: null };
  }
  const fingerprint = lines.join('\n');
  return fingerprint === previous ? { lines: [], fingerprint: null } : { lines: [...lines], fingerprint };
}
