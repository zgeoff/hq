import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { countCIMinutesToday as ciMinutesToday } from './count-ci-minutes-today.ts';
import { formatError as msg } from './format-error.ts';
import { readClaude } from './read-claude.ts';
import { readCloud } from './read-cloud.ts';
import { readImpd } from './read-impd.ts';
import { readOnePassword } from './read-one-password.ts';
import { readPC as readPc } from './read-pc.ts';
import type { CapacityProbe, Errors, Impd, Reading } from './types.ts';

// Read every source. A source that fails stores NULLs and an errors entry; none fails the others.
export async function readCapacity(db: Database, probe: CapacityProbe, at: Date = now()): Promise<Reading> {
  const errors: Errors = {},
    [impd, cloud, pc, op] = await Promise.all([
    readImpd(probe).catch((e) => ({ impd: { budgetMib: null, usedMib: null, committedMib: null, nonnixAwakeMib: null, nixAwakeMib: null } as Impd, error: msg(e) })),
    readCloud(probe).catch((e) => {
      errors['cloud'] = msg(e);
      return null;
    }),
    readPc(probe),
    readOnePassword(probe).catch((error: unknown) => {
      errors['op'] = msg(error);
      return null;
    }),
  ]);
  if (impd.error) {
    errors['impd'] = impd.error;
  }
  if (pc.errors.length > 0) {
    errors['pc'] = pc.errors.join('; ');
  }
  let claude: ReturnType<typeof readClaude> | null = null;
  try {
    claude = readClaude(db, at);
  } catch (e) {
    errors['claude'] = msg(e);
  }
  let ci: number | null = null;
  try {
    ci = ciMinutesToday(db, at);
  } catch (e) {
    errors['ci'] = msg(e);
  }
  return {
    at: iso(at),
    impd_budget_mib: impd.impd.budgetMib,
    impd_used_mib: impd.impd.usedMib,
    impd_committed_mib: impd.impd.committedMib,
    nonnix_awake_mib: impd.impd.nonnixAwakeMib,
    nonnix_awake_vcpus: impd.impd.nonnixAwakeVcpus ?? null,
    nix_awake_mib: impd.impd.nixAwakeMib,
    cloud_avail_bytes: cloud?.avail ?? null,
    cloud_total_bytes: cloud?.total ?? null,
    claude_account: claude?.account ?? null,
    claude_five_hour: claude?.five ?? null,
    claude_seven_day: claude?.seven ?? null,
    claude_five_hour_resets_at: claude?.fiveResetsAt ?? null,
    claude_seven_day_resets_at: claude?.sevenResetsAt ?? null,
    claude_at: claude?.at ?? null,
    ci_minutes_today: ci,
    pc_disk_free_bytes: pc.disk,
    pc_mem_avail_bytes: pc.mem,
    op_account_used: op?.used ?? null,
    op_account_limit: op?.limit ?? null,
    op_refused: op === null ? null : Number(op.refused),
    errors,
  };
}
