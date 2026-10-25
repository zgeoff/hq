export interface CIOverrideUse {
  check: string;
  source: string;
}

export interface GateCI {
  noCI: boolean;
  used: CIOverrideUse[];
}

export function formatCIClause(sha7: string, ci: GateCI): string {
  if (ci.noCI) {
    return `the repo runs no CI at ${sha7}`;
  }
  if (ci.used.length === 0) {
    return `CI green at ${sha7}`;
  }
  return `CI green at ${sha7} except ${ci.used.map((override) => `${override.check}, overridden by the owner (${override.source})`).join('; ')}`;
}
