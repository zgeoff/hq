import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { transcriptPath } from '../repair/transcript-path.ts';
import type { FleetSession } from './types.ts';

// The file side of the scheduled restarts' TranscriptReader: the lines of a session's Claude Code
// transcript, streamed one at a time. None when the session names no transcript or it is missing.
export async function* readTranscriptLines(session: FleetSession, fallbackCwd: string): AsyncGenerator<string> {
  if (!session.agentSessionID) {
    return;
  }
  const path = transcriptPath(session.cwd ?? fallbackCwd, session.agentSessionID);
  if (!existsSync(path)) {
    return;
  }
  yield* createInterface({ input: createReadStream(path), crlfDelay: Infinity });
}
