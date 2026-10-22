import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// The detached restart unit writes its log here, so the folder must exist before it starts.
export function createLogDir(log: string): void {
  mkdirSync(dirname(log), { recursive: true });
}
