// A Prometheus text page number may be in exponent form (1.5e+10).
export function promValue(text: string, name: string): number | null {
  for (const l of text.split('\n')) {
    if (!l.startsWith(name)) continue;
    const m = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\S+)`).exec(l);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}
