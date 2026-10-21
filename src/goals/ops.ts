export const OPS = ['<', '<=', '>=', '>'] as const;
export type Op = (typeof OPS)[number];
