// The full shas that start with the given sha, in the order given.
export function collectShaMatches(shas: string[], given: string): string[] {
  const prefix = given.toLowerCase();
  return shas.filter((sha) => sha.toLowerCase().startsWith(prefix));
}
