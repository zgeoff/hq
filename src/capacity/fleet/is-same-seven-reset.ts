const MATCH_TOLERANCE_MS = 60_000;

export function isSameSevenReset(left: string, right: string): boolean {
  return Math.abs(Date.parse(left) - Date.parse(right)) <= MATCH_TOLERANCE_MS;
}
