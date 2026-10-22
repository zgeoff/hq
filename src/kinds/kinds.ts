export const KINDS = ['fix', 'feat', 'chore', 'docs', 'test', 'refactor', 'ci', 'build', 'perf', 'revert', 'style'] as const;
export type Kind = (typeof KINDS)[number] | 'other';
