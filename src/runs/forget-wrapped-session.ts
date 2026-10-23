import type { FleetClient, StaleOps } from '../fleet/types.ts';

// Stops a run's session, unpins it, then forgets it. A failure leaves it unpinned: in this fleet a
// pin means the session needs the owner, and a failed wrap-up is the orchestrator's to finish. A
// confirmToken answer is a failure, since this forget never destroys the session's host.
export async function forgetWrappedSession(client: FleetClient & StaleOps, id: string): Promise<void> {
  await client.kill(id);
  await client.unpin(id);
  const result = await client.forget(id);
  if (result.confirmToken !== undefined) {
    throw new Error("atc asked to destroy the session's host, which this forget never does");
  }
  if (!result.forgotten) {
    throw new Error('atc did not forget the session');
  }
}
