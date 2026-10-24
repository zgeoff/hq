import { CLOCK_OVERRIDES } from './clock-overrides.ts';
import { isSourceRun } from './is-source-run.ts';

// One line per ignored setting, so a caller who set one learns the installed hq did not take it.
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
