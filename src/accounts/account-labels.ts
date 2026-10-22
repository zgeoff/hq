// Names for the Claude accounts in usage_samples (goals rhythm). The key is an opaque hash of the
// login, never an email; the weekly review shows the name set here, else the first 6 characters.
import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { ACCOUNT_KEY } from '../goals/account-key.ts';
import { ACCOUNT_NAME_RE } from './account-name-re.ts';
import { NAME_MAX } from './name-max.ts';

export function accountLabels(db: Database): Record<string, string> {
  try {
    const j = JSON.parse(getMeta(db, 'usage_accounts') ?? '{}') as unknown;
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (ACCOUNT_KEY.test(k) && typeof v === 'string' && v.length <= NAME_MAX && ACCOUNT_NAME_RE.test(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}
