import type { Database } from 'bun:sqlite';
import { isRecord } from '@zgeoff/std';
import { getMeta } from '../db/get-meta.ts';
import { ACCOUNT_KEY } from '../goals/account-key.ts';
import { parseJSON } from '../noslop/parse-json.ts';
import { ACCOUNT_NAME_RE } from './account-name-re.ts';
import { NAME_MAX } from './name-max.ts';

export function accountLabels(db: Database): Record<string, string> {
  const stored = parseJSON(getMeta(db, 'usage_accounts') ?? '{}');
  if (!isRecord(stored)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (ACCOUNT_KEY.test(key) && typeof value === 'string' && value.length <= NAME_MAX && ACCOUNT_NAME_RE.test(value)) {
      out[key] = value;
    }
  }
  return out;
}
