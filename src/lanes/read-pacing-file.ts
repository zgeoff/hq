import { HqError } from '../errors.ts';
import { pacingPath } from './pacing-path.ts';

// pacing.json as parsed JSON; a file hq cannot read or parse throws.
export async function readPacingFile(): Promise<unknown> {
  try {
    const raw: unknown = await Bun.file(pacingPath()).json();
    return raw;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HqError('no_lanes', `can't read ${pacingPath()}: ${message.slice(0, 200)}`);
  }
}
