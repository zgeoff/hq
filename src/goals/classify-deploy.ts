import { z } from 'zod';
import { FAILED } from './failed.ts';
import type { DeployOutcome } from './types.ts';

const JobsSchema = z.object({ total_count: z.unknown().optional(), jobs: z.array(z.unknown()) });
const JobSchema = z.object({ name: z.string(), conclusion: z.unknown().optional(), steps: z.unknown().optional() });
const CountSchema = z.number().int().safe();
const ConclusionSchema = z.string().nullable();
const APPLY_STEP = 'Apply';
const HOLD_STEP = 'Hold for a manual dispatch';

export function classifyDeploy(jobs: unknown, runConclusion: string | null): { outcome: DeployOutcome; apply_conclusion: string | null; failed_step: string | null } | null {
  const parsed = JobsSchema.safeParse(jobs);
  if (!parsed.success) {
    return null;
  }
  const totalCount = parsed.data.total_count;
  if (totalCount !== undefined) {
    const count = CountSchema.safeParse(totalCount);
    if (!count.success || count.data > parsed.data.jobs.length) {
      return null;
    }
  }
  const list = z.array(JobSchema).safeParse(parsed.data.jobs);
  if (!list.success) {
    return null;
  }
  const apply = list.data.find((job) => job.name === 'apply');
  let conclusion: string | null = null;
  if (apply) {
    const applyConclusion = ConclusionSchema.safeParse(apply.conclusion);
    if (!applyConclusion.success || applyConclusion.data === null) {
      return null;
    }
    conclusion = applyConclusion.data;
  }
  if (runConclusion === 'cancelled' || conclusion === 'cancelled') {
    return { outcome: 'cancelled', apply_conclusion: conclusion, failed_step: null };
  }
  if (!apply || conclusion === 'skipped') {
    return { outcome: 'no_apply', apply_conclusion: conclusion, failed_step: null };
  }
  const steps = collectSteps(apply.steps);
  if (conclusion === 'success') {
    // The apply job can succeed with its Apply step skipped: the queued decision found nothing left to deploy.
    const skipped = steps.some((step) => step.name === APPLY_STEP && step.conclusion === 'skipped');
    return { outcome: skipped ? 'no_apply' : 'applied_ok', apply_conclusion: conclusion, failed_step: null };
  }
  if (conclusion !== null && FAILED.includes(conclusion)) {
    const bad = steps.find((step) => FAILED.includes(String(step.conclusion)) && typeof step.name === 'string');
    const failedStep = typeof bad?.name === 'string' ? bad.name : null;
    return { outcome: failedStep === HOLD_STEP ? 'held' : 'applied_failed', apply_conclusion: conclusion, failed_step: failedStep };
  }
  return { outcome: 'unknown', apply_conclusion: conclusion, failed_step: null };
}

const StepsSchema = z.array(z.unknown());
const StepSchema = z.object({ name: z.unknown().optional(), conclusion: z.unknown().optional() });

type Step = z.output<typeof StepSchema>;

// An entry that is not an object reads as a step with no name or conclusion.
function collectSteps(raw: unknown): Step[] {
  const list = StepsSchema.safeParse(raw);
  return (list.success ? list.data : []).map((entry) => {
    const step = StepSchema.safeParse(entry);
    return step.success ? step.data : { name: undefined, conclusion: undefined };
  });
}
