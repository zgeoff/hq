import { HqError } from '../errors.ts';

// The sweep and the note feed match sessions by full id, so a short id is expanded
// through atc before it is stored. A full id needs no atc.
export async function fullSessionId(sessions: () => Promise<{ id: string }[]>, raw: string): Promise<string> {
  const FULL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (FULL_ID.test(raw)) return raw.toLowerCase();
  if (!/^[0-9a-f-]{4,}$/i.test(raw)) throw new HqError('bad_args', `session "${raw}" must be an atc session id`);
  let all: { id: string }[];
  try {
    all = await sessions();
  } catch (e) {
    throw new HqError('atc_unreachable', `can't expand short session id ${raw} (${(e as Error).message}); give the full id`);
  }
  const hits = all.filter((x) => x.id.toLowerCase().startsWith(raw.toLowerCase()));
  if (hits.length === 1) return hits[0]!.id;
  throw new HqError(hits.length ? 'ambiguous_session' : 'no_such_session', hits.length ? `${hits.length} sessions start with ${raw}; give more of the id` : `no atc session starts with ${raw}`);
}
