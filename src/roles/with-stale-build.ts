import type { Out } from '../commands.ts';

// An `hq fleet` result with the warning from checkFleetBuild on top of its text and in its data.
export function withStaleBuild(out: Out, stale: string | null): Out {
  if (stale === null) {
    return out;
  }
  return { ...out, data: { ...out.data, staleBuild: stale }, text: `WARNING: ${stale}\n${out.text}` };
}
