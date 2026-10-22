// A marker carries a short sha and a review often a full one: the same commit if one prefixes the other.
export function sameSha(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.length <= y.length ? y.startsWith(x) : x.startsWith(y);
}
