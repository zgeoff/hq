import type { FocusArea } from '../focus/focus-areas.ts';

// Every focus area names its repo, or null for one with none, so the two lists cannot drift.
const REPOS = {
  atc: 'atc',
  'auto-mode': 'auto-mode',
  cloud: 'cloud',
  dotfiles: 'dotfiles',
  frankie: null,
  hq: 'hq',
  imp: 'impz',
  nixie: 'nixie',
  'nixie-definitions': 'nixie-definitions',
  noslop: 'noslop',
  osrs: 'osrs',
  pepys: 'pepys',
  tools: 'tools',
  vers: 'vers',
  wringer: 'wringer',
} as const satisfies Record<FocusArea, string | null>;

export const AREA_REPOS: ReadonlyMap<string, string | null> = new Map(Object.entries(REPOS));

// Labels outside the Type and Size groups that name no area (linear-triage's audit-issues.sh, plus the design-lane and parking labels).
export const NOT_AREA_LABELS: ReadonlySet<string> = new Set(['needs geoff', 'quality', 'enabler', 'process', 'with-geoff', 'parked']);
