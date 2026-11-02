import { dirname, join, normalize } from 'node:path/posix';

export type TargetMode = 'file' | 'root';

export function buildMoveCandidates(file: string, from: string, to: string, modes: TargetMode[]): [string, string][] | null {
  const candidates: [string, string][] = [];
  for (const mode of modes) {
    const old = resolveTarget(file, from, mode);
    const moved = resolveTarget(file, to, mode);
    if (old !== null && moved !== null && !candidates.some(([seen, seenTo]) => seen === old && seenTo === moved)) {
      candidates.push([old, moved]);
    }
  }
  return candidates.length === 0 ? null : candidates;
}

function resolveTarget(file: string, target: string, mode: TargetMode): string | null {
  const rooted = target.startsWith('/');
  const joined = rooted || mode === 'root' ? target.replace(/^\/+/u, '') : join(dirname(file), target);
  const resolved = normalize(joined).replace(/^\.\//u, '').replace(/\/+$/u, '');
  if (resolved === '' || resolved === '.' || resolved.startsWith('../') || resolved === '..') {
    return null;
  }
  return resolved;
}
