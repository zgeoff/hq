export const AREA_REPOS: ReadonlyMap<string, string | null> = new Map([
  ['atc', 'atc'],
  ['auto-mode', 'auto-mode'],
  ['cloud', 'cloud'],
  ['frankie', null],
  ['hq', 'hq'],
  ['imp', 'impz'],
  ['nixie', 'nixie'],
  ['osrs', 'osrs'],
  ['pepys', 'pepys'],
  ['tools', 'tools'],
  ['vers', 'vers'],
]);

// Labels outside the Type and Size groups that name no area (linear-triage's audit-issues.sh).
export const NOT_AREA_LABELS: ReadonlySet<string> = new Set(['needs geoff', 'quality', 'enabler', 'process']);
