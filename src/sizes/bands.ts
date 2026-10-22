// [low, high) in lines changed, additions plus deletions.
export const BANDS = { S: [0, 500], M: [500, 2000], L: [2000, 5000], XL: [5000, Infinity] } as const;
export type Size = keyof typeof BANDS;
