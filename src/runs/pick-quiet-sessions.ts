import type { AtcSession } from './collect-guarded-sessions.ts';

export interface SessionActivity {
  lastActivityAt: number | null;
  pendingMessage: string | null;
}

// A stacked run merges a lower layer with its FINAL while its agent still builds the next one, so
// a session ends only once atc shows it, and every session the wrap-up could forget, idle and quiet.
// Missing activity counts as recent. Returns the checked ids, or null when the run must wait.
export function pickQuietSessions(guarded: readonly AtcSession[] | null, activity: ReadonlyMap<string, SessionActivity | null>, quietBefore: number): string[] | null {
  if (guarded === null) {
    return null;
  }
  const quiet = guarded.every((session) => {
    const read = activity.get(session.id) ?? null;
    return read !== null && isIdle(session, read.pendingMessage) && typeof read.lastActivityAt === 'number' && read.lastActivityAt <= quietBefore;
  });
  return quiet ? guarded.map((session) => session.id) : null;
}

// Claude Code's idle notification: about a minute after a finished turn, and only with no menu or
// background subagent open. atc then shows the session as needs_you with this pending message.
const CLAUDE_IDLE_MESSAGE = 'Claude is waiting for your input';

// atc revives each session after its daemon restarts, and shows it running with this last message
// until a new turn starts; no Claude Code hook fires, since no response has finished since.
const REVIVED_MESSAGE = 'revived';

function isIdle(session: AtcSession, pendingMessage: string | null): boolean {
  return session.state === 'done' || (session.state === 'needs_you' && pendingMessage === CLAUDE_IDLE_MESSAGE) || (session.state === 'running' && session.lastMsg === REVIVED_MESSAGE);
}
