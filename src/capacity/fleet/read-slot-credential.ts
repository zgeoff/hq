import { cleanEnv } from '../../runner/clean-env.ts';
import type { Runner } from '../../runner/types.ts';

export type SlotCredential = { kind: 'ready'; credential: string } | { kind: 'failed'; reason: string };

// The reason names what to do and never quotes op's stderr, which can echo what it was given.
export async function readSlotCredential(run: Runner, opToken: string, slot: number): Promise<SlotCredential> {
  const result = await run(['op', 'read', `op://claude-slots/claude-setup-token-${slot}/credential`], { env: cleanEnv({ OP_SERVICE_ACCOUNT_TOKEN: opToken }) });
  if (result.code !== 0) {
    return { kind: 'failed', reason: `op read failed (exit ${result.code})${pickFailureReason(result.stderr)}` };
  }
  const credential = result.stdout.trim();
  if (credential === '') {
    return { kind: 'failed', reason: 'op read gave no token' };
  }
  return { kind: 'ready', credential };
}

const AUTH_FAILURE = /auth|sign.?in|token|unauthori[sz]ed|forbidden|401|403/iu;
const RATE_LIMITED = /too many requests|rate.?limit/iu;

function pickFailureReason(stderr: string): string {
  if (RATE_LIMITED.test(stderr)) {
    return ": 1Password's rate limit; op service-account ratelimit shows which limit and when it resets";
  }
  return AUTH_FAILURE.test(stderr) ? ': re-mint with op-mint hq' : '';
}
