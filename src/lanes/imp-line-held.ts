// What a slot pool's imp `held` reads when impd's non-Nix memory or vCPU line, not the budget, holds
// imp slots back.
export const IMP_LINE_HELD = { memory: 'impd at line', vcpu: 'impd at vCPU line' } as const;
