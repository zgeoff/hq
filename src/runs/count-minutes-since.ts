export function countMinutesSince(from: string, to: Date): number {
  return (to.getTime() - Date.parse(from)) / 60_000;
}
