// The two kinds of design pass: an agent designs alone, or one designs with the owner.
export const DESIGN_LANES = ['agent', 'with-geoff'] as const;

export type DesignLane = (typeof DESIGN_LANES)[number];
