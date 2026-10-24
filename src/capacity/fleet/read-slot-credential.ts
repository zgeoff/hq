import { cleanEnv } from '../../runner/clean-env.ts';
import type { Runner } from '../../runner/types.ts';

export async function readSlotCredential(run: Runner, opToken: string, slot: number): Promise<string | null> {
  const result = await run(['op', 'read', `op://claude-slots/claude-setup-token-${slot}/credential`], { env: cleanEnv({ OP_SERVICE_ACCOUNT_TOKEN: opToken }) });
  const credential = result.stdout.trim();
  if (result.code !== 0 || credential === '') {
    return null;
  }
  return credential;
}
