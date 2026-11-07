export const UNSAFE_RULES = ['assignment', 'member-access', 'argument', 'call', 'return'] as const;

export const UNSAFE_PREFIX = 'typescript(no-unsafe-';

export const TYPE_AWARE_ARGS: readonly string[] = ['--type-aware', '-A', 'all', ...UNSAFE_RULES.flatMap((rule) => ['-D', `typescript/no-unsafe-${rule}`])];
