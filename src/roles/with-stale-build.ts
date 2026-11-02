import type { Out } from '../commands.ts';

export function withStaleBuild(out: Out, stale: string | null): Out {
  if (stale === null) {
    return out;
  }
  return { ...out, data: { ...out.data, staleBuild: stale }, text: `WARNING: ${stale}\n${out.text}` };
}
