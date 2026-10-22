import { HqError } from '../errors.ts';
import { pacingPath } from './pacing-path.ts';

// pacing.json as parsed JSON; a file hq cannot read or parse throws.
export async function readPacingFile(): Promise<unknown> {
  try {
    return (await Bun.file(pacingPath()).json()) as unknown;
  } catch (error) {
    throw new HqError('no_lanes', `can't read ${pacingPath()}: ${String((error as Error).message ?? error).slice(0, 200)}`);
  }
}
