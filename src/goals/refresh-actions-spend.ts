import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { ACTIONS_SPEND_KEY } from './actions-spend-key.ts';
import { readActionsSpend } from './read-actions-spend.ts';

// Reads the month's Actions spend from GitHub and keeps it in meta for the goals check-ins. A failed
// read replaces the last reading with the failure, so the check-ins show the spend as unknown
// rather than an old figure. Returns the failure's message, or null when the read worked.
export async function refreshActionsSpend(db: Database, run: Runner, at: Date = now(), env?: RunOpts['env']): Promise<string | null> {
  const base = { at: iso(at), month: iso(at).slice(0, 7) };
  try {
    const net = await readActionsSpend(run, at, env);
    setMeta(db, ACTIONS_SPEND_KEY, JSON.stringify({ ...base, net }));
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMeta(db, ACTIONS_SPEND_KEY, JSON.stringify({ ...base, error: message }));
    return message;
  }
}
