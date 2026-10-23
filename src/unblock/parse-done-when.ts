import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import type { DoneWhen } from './types.ts';

const ISSUE = /^(?<team>[A-Za-z][A-Za-z0-9]*)-(?<number>\d+)$/u;
const PR = /^(?:(?<owner>[\w.-]+)\/)?(?<repo>[\w.-]+)#(?<number>\d+)$/u;
const REPO = /^(?:(?<owner>[\w.-]+)\/)?(?<repo>[\w.-]+)$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const DEFAULT_OWNER = 'zgeoff';

export function parseDoneWhen(raw: string): DoneWhen {
  const colon = raw.indexOf(':');
  const kind = colon === -1 ? '' : raw.slice(0, colon);
  const ref = colon === -1 ? '' : raw.slice(colon + 1).trim();
  if (kind === 'issue') {
    const groups = ISSUE.exec(ref)?.groups;
    if (groups) {
      return { kind, ref: `${groups['team']?.toUpperCase()}-${groups['number']}` };
    }
  } else if (kind === 'pr') {
    const groups = PR.exec(ref)?.groups;
    if (groups) {
      return { kind, ref: `${groups['owner'] ?? DEFAULT_OWNER}/${groups['repo']}#${groups['number']}` };
    }
  } else if (kind === 'doc' && ref !== '' && !/\s/u.test(ref)) {
    return { kind, ref };
  } else if (kind === 'release') {
    const groups = REPO.exec(ref)?.groups;
    if (groups) {
      return { kind, ref: `${groups['owner'] ?? DEFAULT_OWNER}/${groups['repo']}` };
    }
  } else if (kind === 'date' && ISO_TIME.test(ref) && !Number.isNaN(Date.parse(ref))) {
    return { kind, ref: iso(new Date(ref)) };
  }
  throw new HqError('bad_args', `cannot read --done-when "${raw}": use issue:GEO-1, pr:repo#1 or pr:owner/repo#1, doc:<Linear document id, slug or URL>, release:repo or release:owner/repo, or date:<ISO time, such as 2026-11-02T09:00:00Z>`);
}
