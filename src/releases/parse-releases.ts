import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { TAG } from './tag.ts';
import type { Release } from './types.ts';

// Published releases of one repo whose tag is ours, newest first. Anything odd refuses the repo.
export function parseReleases(raw: unknown, tag: RegExp): Release[] {
  if (!Array.isArray(raw)) throw new HqError('bad_releases', 'the releases list is not an array');
  const out: Release[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') throw new HqError('bad_releases', 'a release row is not an object');
    const r = x as Record<string, unknown>;
    if (typeof r['tag_name'] !== 'string' || !TAG.test(r['tag_name'])) {
      throw new HqError('bad_releases', `a release has a bad tag name (${String(r['tag_name']).slice(0, 40)})`);
    }
    if (typeof r['draft'] !== 'boolean' || typeof r['prerelease'] !== 'boolean') {
      throw new HqError('bad_releases', `release ${r['tag_name']} has no draft or prerelease flag`);
    }
    if (r['draft'] || r['prerelease']) {
      continue;
    }
    if (typeof r['published_at'] !== 'string' || Number.isNaN(Date.parse(r['published_at']))) {
      throw new HqError('bad_releases', `release ${r['tag_name']} has no published_at`);
    }
    if (tag.test(r['tag_name'])) {
      out.push({ tag: r['tag_name'], at: iso(new Date(r['published_at'])) });
    }
  }
  return out.sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!));
}
