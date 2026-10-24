interface ClaudeUse {
  window: '7-day' | '5-hour';
  usedPct: number;
  warnPct: number;

  // pacing.json's providers.claude.threshold: launches stop there, not at the warning.
  launchPct: number | null;
  account: string | null;
}

// One Claude usage alert line, worded as the early warning it is, with the launch limit beside it.
export function formatClaudeLine(use: ClaudeUse): string {
  const limit = use.launchPct === null ? '' : ` (launch limit ${use.launchPct}%)`;
  const account = use.account === null ? '' : ` (account ${use.account})`;
  return `Claude: ${use.window} usage at ${Math.round(use.usedPct)}%, early warning at ${use.warnPct}%${limit}${account}`;
}
