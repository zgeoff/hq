import { HqError } from '../errors.ts';
import { checkMergeGate } from '../noslop/check-merge-gate.ts';
import type { GateOutcome } from '../noslop/check-merge-gate.ts';
import { parseLowerRepo } from '../noslop/parse-lower-repo.ts';
import type { PRRequest } from '../noslop/run-review-check.ts';
import { OWNER } from '../releases/owner.ts';
import { recordPRGate } from './record-pr-gate.ts';
import type { PRGateResult } from './record-pr-gate.ts';

export async function checkRecordedGate(request: PRRequest): Promise<GateOutcome> {
  const seen: { head: string | null } = { head: null };
  try {
    const outcome = await checkMergeGate(request, (head) => {
      seen.head = head;
    });
    await tryRecord(request, pickPassResult(outcome, seen.head));
    return outcome;
  } catch (error) {
    if (error instanceof HqError && error.code === 'merge_blocked' && seen.head !== null) {
      await tryRecord(request, { gate: 'fail', head: seen.head });
    }
    throw error;
  }
}

function pickPassResult(outcome: GateOutcome, head: string | null): PRGateResult | null {
  if (!outcome.reviewed) {
    return { gate: 'none', head: null };
  }
  return head === null ? null : { gate: 'pass', head };
}

// Whether the result was recorded.
async function tryRecord(request: PRRequest, result: PRGateResult | null): Promise<boolean> {
  if (result === null) {
    return false;
  }
  try {
    const parsed = parseLowerRepo(request.rawRepo, request.owner);
    if (parsed.owner !== OWNER) {
      return false;
    }
    await recordPRGate(request.db, { repo: parsed.repo, pr: request.pr }, result, 'hq');
    return true;
  } catch (error) {
    console.error(`hq: warning: the gate's ${result.gate} was not written to the PR record of ${request.rawRepo}#${request.pr}: ${(error as Error).message}`);
    return false;
  }
}
