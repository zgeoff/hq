import { FAILED } from './failed.ts';
import type { DeployOutcome } from './types.ts';

const APPLY_STEP = 'Apply',
  HOLD_STEP = 'Hold for a manual dispatch';

// The outcome of one completed run from its jobs answer, or null when the answer can't be read.
// The workflow has jobs decide, apply and alert: apply skipped (or absent) means nothing to apply;
// apply failing on the step named HOLD_STEP is a hold, not a failure; apply succeeding with its
// APPLY_STEP skipped found nothing to apply.
export function classifyDeploy(jobs: unknown, runConclusion: string | null): { outcome: DeployOutcome; apply_conclusion: string | null; failed_step: string | null } | null {
  const j = jobs as { total_count?: unknown; jobs?: unknown } | null;
  if (!j || typeof j !== 'object' || !Array.isArray(j.jobs)) return null;
  if (j.total_count !== undefined && (!Number.isSafeInteger(j.total_count) || (j.total_count as number) > j.jobs.length)) return null;
  const list = j.jobs as { name?: unknown; conclusion?: unknown; steps?: unknown }[];
  if (list.some((x) => !x || typeof x !== 'object' || typeof x.name !== 'string')) return null;
  const apply = list.find((x) => x.name === 'apply');
  if (apply && apply.conclusion !== null && typeof apply.conclusion !== 'string') return null;
  const c = apply ? (apply.conclusion as string | null) : null;
  if (apply && c === null) return null; // a finished run whose apply job has no conclusion
  if (runConclusion === 'cancelled' || c === 'cancelled') return { outcome: 'cancelled', apply_conclusion: c, failed_step: null };
  if (!apply || c === 'skipped') return { outcome: 'no_apply', apply_conclusion: c, failed_step: null };
  if (c === 'success') {
    // The apply job can succeed with its Apply step skipped: the queued decision found nothing left to deploy.
    const steps = Array.isArray(apply.steps) ? (apply.steps as { name?: unknown; conclusion?: unknown }[]) : [];
    const skipped = steps.some((x) => x && x.name === APPLY_STEP && x.conclusion === 'skipped');
    return { outcome: skipped ? 'no_apply' : 'applied_ok', apply_conclusion: c, failed_step: null };
  }
  if (FAILED.includes(c!)) {
    const steps = Array.isArray(apply.steps) ? (apply.steps as { name?: unknown; conclusion?: unknown }[]) : [];
    const bad = steps.find((x) => x && FAILED.includes(String(x.conclusion)) && typeof x.name === 'string');
    const step = bad ? (bad.name as string) : null;
    return { outcome: step === HOLD_STEP ? 'held' : 'applied_failed', apply_conclusion: c, failed_step: step };
  }
  return { outcome: 'unknown', apply_conclusion: c, failed_step: null };
}
