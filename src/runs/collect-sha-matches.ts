export function collectShaMatches(shas: string[], given: string): string[] {
  const prefix = given.toLowerCase();
  return shas.filter((sha) => sha.toLowerCase().startsWith(prefix));
}
