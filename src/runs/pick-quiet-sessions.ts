import type { AtcSession } from './collect-guarded-sessions.ts';

// A stacked run merges a lower layer with its FINAL while its agent still builds the next one, so
// a session ends only once atc shows it, and every session the wrap-up could forget, done and quiet.
// Missing activity counts as recent. Returns the checked ids, or null when the run must wait.
export function pickQuietSessions(guarded: readonly AtcSession[] | null, activity: ReadonlyMap<string, number | null>, quietBefore: number): string[] | null {
  if (guarded === null) {
    return null;
  }
  const quiet = guarded.every((session) => {
    const last = activity.get(session.id);
    return session.state === 'done' && typeof last === 'number' && last <= quietBefore;
  });
  return quiet ? guarded.map((session) => session.id) : null;
}
