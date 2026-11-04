const REPO_EXCEPTIONS: ReadonlyMap<string, string | null> = new Map([
  ['imp', 'impz'],
  ['frankie', null],
]);

export function pickAreaRepo(label: string): string | null {
  return REPO_EXCEPTIONS.has(label) ? (REPO_EXCEPTIONS.get(label) ?? null) : label;
}

export const NOT_AREA_LABELS: ReadonlySet<string> = new Set(['needs geoff', 'quality', 'enabler', 'process', 'with-geoff', 'parked']);
