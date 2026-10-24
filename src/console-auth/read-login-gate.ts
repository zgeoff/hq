import type { OwnerProbeClient } from '../pr-status/read-owner-session.ts';

export type LoginGate = { ok: true } | { ok: false; reason: string };

export interface LoginGateDeps {
  isTTY: boolean;
  openClient: () => Promise<OwnerProbeClient>;
}

// A login link is printed only to a terminal that atc places in no session: a session's output
// lands in a transcript that other sessions can read.
export async function readLoginGate(deps: LoginGateDeps): Promise<LoginGate> {
  if (!deps.isTTY) {
    return { ok: false, reason: 'its output is not a terminal' };
  }
  try {
    const client = await deps.openClient();
    try {
      return getGate(client.peerSession);
    } finally {
      client.close();
    }
  } catch (error) {
    return { ok: false, reason: `atc could not say where it runs: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function getGate(peerSession: string | null | undefined): LoginGate {
  if (peerSession === undefined) {
    return { ok: false, reason: "atc's hello names no caller session, so this daemon cannot say where it runs" };
  }
  if (peerSession !== null) {
    return { ok: false, reason: `it runs inside atc session ${peerSession.slice(0, 8)}, whose transcript other sessions can read` };
  }
  return { ok: true };
}
