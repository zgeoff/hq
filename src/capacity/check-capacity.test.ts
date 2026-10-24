import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { checkCapacity } from './check-capacity.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

// A reading with every source empty, so only the lane plan decides; the hold rule needs 2 samples
// in a row, at noon Sydney so nothing waits for quiet hours to end.
test('an imp lane plan over impd\'s line opens the lanes:plan alert after 2 samples, and a plan that fits clears it after 2 more', () => {
  const ctx = setupTest(),
    fits = { slots: 7, mib: 14_336, vcpus: 14, maxMib: 16_384, maxVcpus: 16, overMib: false, overVcpus: false },
    over = { slots: 9, mib: 18_432, vcpus: 18, maxMib: 16_384, maxVcpus: 16, overMib: true, overVcpus: true },
    reading = { at: '2026-10-15T01:00:00Z', impd_budget_mib: null, impd_used_mib: null, impd_committed_mib: null, nonnix_awake_mib: null, nonnix_awake_vcpus: null, nix_awake_mib: null, cloud_avail_bytes: null, cloud_total_bytes: null, claude_account: null, claude_five_hour: null, claude_seven_day: null, claude_at: null, ci_minutes_today: null, pc_disk_free_bytes: null, pc_mem_avail_bytes: null, op_account_used: null, op_account_limit: null, op_refused: null, errors: {} },
    ticks = [
      checkCapacity(ctx.db, { reading, plan: over }, 'hq-lanes', new Date('2026-10-15T01:00:00Z')),
      checkCapacity(ctx.db, { reading, plan: over }, 'hq-lanes', new Date('2026-10-15T01:05:00Z')),
      checkCapacity(ctx.db, { reading, plan: fits }, 'hq-lanes', new Date('2026-10-15T01:10:00Z')),
      checkCapacity(ctx.db, { reading, plan: fits }, 'hq-lanes', new Date('2026-10-15T01:15:00Z')),
    ];

  expect([ticks.map((tick) => [tick.opened, tick.cleared]), [...new Set((ctx.db.query('SELECT text FROM outbox ORDER BY id').all() as { text: string }[]).map((row) => row.text))]]).toStrictEqual([
    [
      [[], []],
      [['lanes:plan'], []],
      [[], []],
      [[], ['lanes:plan']],
    ],
    [
      "Capacity watch: something is over its line.\n- pacing.json: the imp lanes' 9 slots, all full, cross impd's non-Nix line (plan 18/16 GiB, 18/16 vCPU); shrink the imp lanes or raise the line\nhq capacity shows every reading. hq changed nothing.",
      "Capacity watch: back under the line.\n- the imp lanes' plan back under 16,384 MiB and 16 vCPUs (open 10 min)\nhq capacity shows every reading. hq changed nothing.",
    ],
  ]);
});

test('with no lanes read, the lanes:plan rule holds no opinion and opens nothing', () => {
  const ctx = setupTest(),
    reading = { at: '2026-10-15T01:00:00Z', impd_budget_mib: null, impd_used_mib: null, impd_committed_mib: null, nonnix_awake_mib: null, nonnix_awake_vcpus: null, nix_awake_mib: null, cloud_avail_bytes: null, cloud_total_bytes: null, claude_account: null, claude_five_hour: null, claude_seven_day: null, claude_at: null, ci_minutes_today: null, pc_disk_free_bytes: null, pc_mem_avail_bytes: null, op_account_used: null, op_account_limit: null, op_refused: null, errors: {} },
    ticks = [checkCapacity(ctx.db, { reading, plan: null }, 'hq-lanes', new Date('2026-10-15T01:00:00Z')), checkCapacity(ctx.db, { reading, plan: null }, 'hq-lanes', new Date('2026-10-15T01:05:00Z'))];

  expect([ticks.map((tick) => tick.opened), ctx.db.query("SELECT value FROM meta WHERE key = 'capacity_counts'").get()]).toStrictEqual([[[], []], { value: '{}' }]);
});

test('a Claude usage alert reads as the early warning and names the launch limit, and clears back under the warning', () => {
  const ctx = setupTest();
  const empty = { at: '2026-10-15T01:00:00Z', impd_budget_mib: null, impd_used_mib: null, impd_committed_mib: null, nonnix_awake_mib: null, nonnix_awake_vcpus: null, nix_awake_mib: null, cloud_avail_bytes: null, cloud_total_bytes: null, claude_account: null, claude_five_hour: 10, claude_seven_day: 91, claude_at: '2026-10-15T01:00:00Z', ci_minutes_today: null, pc_disk_free_bytes: null, pc_mem_avail_bytes: null, op_account_used: null, op_account_limit: null, op_refused: null, errors: {} };
  const under = { ...empty, claude_seven_day: 40 };
  for (const [reading, minute] of [[empty, 0], [empty, 5], [under, 10], [under, 15]] as const) {
    checkCapacity(ctx.db, { reading, plan: null, claudeLaunchPct: 95 }, 'hq-lanes', new Date(Date.parse('2026-10-15T01:00:00Z') + minute * 60_000));
  }

  const rows = z.array(z.object({ text: z.string() })).parse(ctx.db.query('SELECT text FROM outbox ORDER BY id').all());

  expect([...new Set(rows.map((row) => row.text))]).toStrictEqual([
    'Capacity watch: something is over its line.\n- Claude: 7-day usage at 91%, early warning at 85% (launch limit 95%)\nhq capacity shows every reading. hq changed nothing.',
    'Capacity watch: back under the line.\n- Claude: 7-day usage back under the 85% early warning (open 10 min)\nhq capacity shows every reading. hq changed nothing.',
  ]);
});
