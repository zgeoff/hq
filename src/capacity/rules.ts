import { accountName } from '../accounts/account-name.ts';
import { formatGiB as gib } from './format-gib.ts';
import { formatPlanOverage } from '../lanes/format-plan-overage.ts';
import { formatNumber as n0 } from './format-number.ts';
import type { Rule } from './types.ts';

export const RULES: Rule[] = [
  {
    key: 'impd:nonnix',
    label: 'impd: non-Nix imps awake',
    limit: (s) => `${n0(s.nonnixMaxMib)} MiB`,
    urgent: true,
    breached: (r, s) => (r.nonnix_awake_mib === null ? null : r.nonnix_awake_mib > s.nonnixMaxMib),
    line: (r, s) => `impd: non-Nix imps awake ${n0(r.nonnix_awake_mib!)} MiB, over ${n0(s.nonnixMaxMib)} MiB${r.impd_used_mib === null || r.impd_budget_mib === null ? '' : ` (budget used ${n0(r.impd_used_mib)}/${n0(r.impd_budget_mib)})`}`,
  },
  {
    key: 'lanes:plan',
    label: "the imp lanes' plan",
    limit: (s) => `${n0(s.nonnixMaxMib)} MiB and ${s.nonnixMaxVcpus} vCPUs`,
    breached: (_r, _s, plan) => (plan === null ? null : plan.overMib || plan.overVcpus),
    line: (_r, _s, _names, plan) => (plan === null ? 'pacing.json: no imp lanes read' : `pacing.json: the imp lanes' ${plan.slots} slots, all full, cross impd's non-Nix line (${formatPlanOverage(plan) ?? 'within both lines'}); shrink the imp lanes or raise the line`),
  },
  {
    key: 'cloud:memory',
    label: 'cloud: memory available',
    limit: (s) => `${s.cloudMinAvailGiB} GiB`,
    breached: (r, s) => (r.cloud_avail_bytes === null ? null : r.cloud_avail_bytes < s.cloudMinAvailGiB * 2 ** 30),
    line: (reading, settings) => `cloud: ${gib(reading.cloud_avail_bytes ?? 0)} GiB memory available, under ${settings.cloudMinAvailGiB} GiB${reading.cloud_total_bytes === null ? '' : ` (of ${gib(reading.cloud_total_bytes)} GiB)`}`,
  },
  {
    key: 'claude:7d',
    label: 'Claude: 7-day usage',
    limit: (s) => `${s.claudeSevenDayPct}%`,
    breached: (r, s) => (r.claude_seven_day === null ? null : r.claude_seven_day >= s.claudeSevenDayPct),
    line: (r, s, names) => `Claude: 7-day usage at ${Math.round(r.claude_seven_day!)}%, at or over ${s.claudeSevenDayPct}%${r.claude_account ? ` (account ${accountName(names, r.claude_account)})` : ''}`,
  },
  {
    key: 'claude:5h',
    label: 'Claude: 5-hour usage',
    limit: (s) => `${s.claudeFiveHourPct}%`,
    breached: (r, s) => (r.claude_five_hour === null ? null : r.claude_five_hour >= s.claudeFiveHourPct),
    line: (r, s, names) => `Claude: 5-hour usage at ${Math.round(r.claude_five_hour!)}%, at or over ${s.claudeFiveHourPct}%${r.claude_account ? ` (account ${accountName(names, r.claude_account)})` : ''}`,
  },
  {
    key: 'op:daily',
    label: '1Password: requests today',
    limit: (s) => `${s.opDailyPct}% of the daily limit`,
    breached: (r, s) => (r.op_account_used === null || r.op_account_limit === null || r.op_account_limit === 0 ? null : (r.op_account_used / r.op_account_limit) * 100 >= s.opDailyPct),
    line: (r, s) => `1Password: ${n0(r.op_account_used ?? 0)} of ${n0(r.op_account_limit ?? 0)} requests today, at or over ${s.opDailyPct}%`,
  },
  {
    key: 'op:refused',
    label: '1Password: requests refused',
    limit: () => 'none refused',
    urgent: true,
    breached: (r) => (r.op_refused === null ? null : r.op_refused === 1),
    line: () => '1Password is refusing requests: a limit is spent. op service-account ratelimit shows which and when it resets',
  },
];
