import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { TAG } from './tag.ts';
import type { Release } from './types.ts';
import { isRecord } from '@zgeoff/std';

export function parseReleases(raw: unknown, tag: RegExp): Release[] {
  if (!Array.isArray(raw)) throw new HqError('bad_releases', 'the releases list is not an array');
  const out: Release[] = [];
  for (const release of raw) {
    if (!isRecord(release)) {
      throw new HqError('bad_releases', 'a release row is not an object');
    }
    if (typeof release['tag_name'] !== 'string' || !TAG.test(release['tag_name'])) {
      throw new HqError('bad_releases', `a release has a bad tag name (${String(release['tag_name']).slice(0, 40)})`);
    }
    if (typeof release['draft'] !== 'boolean' || typeof release['prerelease'] !== 'boolean') {
      throw new HqError('bad_releases', `release ${release['tag_name']} has no draft or prerelease flag`);
    }
    if (release['draft'] || release['prerelease']) {
      continue;
    }
    if (typeof release['published_at'] !== 'string' || Number.isNaN(Date.parse(release['published_at']))) {
      throw new HqError('bad_releases', `release ${release['tag_name']} has no published_at`);
    }
    if (tag.test(release['tag_name'])) {
      out.push({ tag: release['tag_name'], at: iso(new Date(release['published_at'])) });
    }
  }
  return out.sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!));
}
