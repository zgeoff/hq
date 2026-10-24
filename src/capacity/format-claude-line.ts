interface ClaudeUse {
  window: '7-day' | '5-hour';
  usedPct: number;
  warnPct: number;

  // pacing.json's providers.claude.threshold: launches stop there, not at the warning.
  launchPct: number | null;
  resetsAt: string | null;
  account: string | null;
}

// One Claude usage alert line, worded as the early warning it is, with the launch limit and the
// window's reset beside it.
export function formatClaudeLine(use: ClaudeUse): string {
  const notes = [...(use.launchPct === null ? [] : [`launch limit ${use.launchPct}%`]), ...(use.resetsAt === null ? [] : [`resets ${formatReset(use.resetsAt)}`])];
  const limit = notes.length === 0 ? '' : ` (${notes.join('; ')})`;
  const account = use.account === null ? '' : ` (account ${use.account})`;
  return `Claude: ${use.window} usage at ${Math.round(use.usedPct)}%, early warning at ${use.warnPct}%${limit}${account}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "28 Oct 08:00Z": the day, month and UTC time of an ISO time.
function formatReset(time: string): string {
  const date = new Date(time);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''} ${hours}:${minutes}Z`;
}
