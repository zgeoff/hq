export const DESIGN_LANES = ['agent', 'with-geoff'] as const;

export type DesignLane = (typeof DESIGN_LANES)[number];
