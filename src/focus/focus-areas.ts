// The area labels Linear issues carry: any label outside the Type and Size groups other than Needs
// Geoff, quality, enabler and process (linear-triage's audit-issues.sh). A focus term or reserve
// names one of these; a label added in Linear joins here before focus can name it, and
// `hq linear areas` names any it lacks.
export const FOCUS_AREAS = ['atc', 'auto-mode', 'cloud', 'dotfiles', 'frankie', 'hq', 'imp', 'nixie', 'nixie-definitions', 'noslop', 'osrs', 'pepys', 'tools', 'vers', 'wringer'] as const;

export type FocusArea = (typeof FOCUS_AREAS)[number];
