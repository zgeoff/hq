// The stored id can be a short prefix of the full id, so either side may be the prefix. Returns
// null when no session matches or more than one does.
export function pickRunSession(storedIDs: readonly string[], given: string): string | null {
  const wanted = given.toLowerCase();
  const hits = storedIDs.filter((stored) => {
    const id = stored.toLowerCase();
    return id.startsWith(wanted) || wanted.startsWith(id);
  });
  return hits.length === 1 ? (hits[0] ?? null) : null;
}
