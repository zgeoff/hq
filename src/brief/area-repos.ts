// The zgeoff repo each area label names. An area with no repo of its own maps to null, so a brief
// for it is refused by name rather than pointed at a repo that does not exist.
export const AREA_REPOS: Readonly<Record<string, string | null>> = {
  atc: 'atc',
  'auto-mode': 'auto-mode',
  cloud: 'cloud',
  frankie: null,
  hq: 'hq',
  imp: 'impz',
  nixie: 'nixie',
  osrs: 'osrs',
  pepys: 'pepys',
  tools: 'tools',
  vers: 'vers',
};

// Labels outside the Type and Size groups that name no area (linear-triage's audit-issues.sh).
export const NOT_AREA_LABELS: ReadonlySet<string> = new Set(['needs geoff', 'quality', 'enabler', 'process']);
