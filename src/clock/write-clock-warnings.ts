import { CLOCK_OVERRIDES } from './clock-overrides.ts';
import { isSourceRun } from './is-source-run.ts';

export function writeClockWarnings(env: Record<string, string | undefined>, write: (line: string) => void): void {
  if (isSourceRun()) {
    return;
  }
  for (const name of CLOCK_OVERRIDES) {
    if (env[name] !== undefined) {
      write(`hq: ${name} is ignored in the installed hq`);
    }
  }
}
