import { HqError } from '../errors.ts';
import type { DoneWhen } from './types.ts';

const ISSUE = /^(?<team>[A-Za-z][A-Za-z0-9]*)-(?<number>\d+)$/u;
const PR = /^(?:(?<owner>[\w.-]+)\/)?(?<repo>[\w.-]+)#(?<number>\d+)$/u;
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
  }
  throw new HqError('bad_args', `cannot read --done-when "${raw}": use issue:GEO-1, pr:repo#1 or pr:owner/repo#1, or doc:<Linear document id, slug or URL>`);
}
