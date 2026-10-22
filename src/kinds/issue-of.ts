// The Linear issue a PR body names: Fixes first, then Contributes to, then Related to.
export function issueOf(body: string | null | undefined): string | null {
  if (!body) return null;
  for (const rel of ['Fixes', 'Contributes to', 'Related to']) {
    const m = new RegExp(`\\b${rel}:?\\s+([A-Z][A-Z0-9]*-\\d+)\\b`).exec(body);
    if (m) return m[1]!;
  }
  return null;
}
