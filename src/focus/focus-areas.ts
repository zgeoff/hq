export const FOCUS_AREAS = ['atc', 'auto-mode', 'cloud', 'dotfiles', 'frankie', 'hq', 'imp', 'nixie', 'nixie-definitions', 'noslop', 'osrs', 'pepys', 'skills', 'tools', 'vers', 'wringer', 'wulez'] as const;

export type FocusArea = (typeof FOCUS_AREAS)[number];
