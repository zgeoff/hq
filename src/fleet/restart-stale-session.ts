import { HqError } from '../errors.ts';
import type { FleetClient, StaleOps } from './types.ts';

// Stops the session, unpins it, then forgets it. A forget that fails pins the session again, so
// it is never left unpinned and unforgotten. A confirmToken answer is a failure: this forget never
// destroys the session's host.
export async function restartStaleSession(client: FleetClient & StaleOps, id: string): Promise<void> {
  await client.kill(id);
  await client.unpin(id);
  let failure: string | null = null;
  try {
    const result = await client.forget(id);
    if (result.confirmToken !== undefined) {
      failure = "atc asked to destroy the session's host, which this forget never does";
    } else if (!result.forgotten) {
      failure = 'atc did not forget the session';
    }
  } catch (error) {
    failure = String((error as Error).message ?? error);
  }
  if (failure === null) {
    return;
  }
  const pinFailure = await writePinAgain(client, id);
  if (pinFailure !== null) {
    throw new HqError('restart_failed', `forget ${id.slice(0, 8)} failed (${failure}); pinning it again failed too (${pinFailure}), so it is stopped and unpinned`);
  }
  throw new HqError('restart_failed', `forget ${id.slice(0, 8)} failed (${failure}); pinned it again`);
}

async function writePinAgain(client: FleetClient, id: string): Promise<string | null> {
  try {
    await client.pin(id);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
