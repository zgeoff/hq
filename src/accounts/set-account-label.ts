import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { ACCOUNT_KEY } from '../goals/account-key.ts';
import { logEvent } from '../log-event.ts';
import { accountLabels } from './account-labels.ts';
import { ACCOUNT_NAME_RE } from './account-name-re.ts';
import { NAME_MAX } from './name-max.ts';

// hq goals account <key> <name> | hq goals account <key> none
export function setAccountLabel(db: Database, key: string, name: string, actor: string): string | null {
  if (!ACCOUNT_KEY.test(key)) throw new HqError('bad_args', 'the account key must be 12 lowercase hex characters, as hq goals shows it');
  const clear = name === 'none';
  if (!clear && (name.length > NAME_MAX || !ACCOUNT_NAME_RE.test(name))) {
    throw new HqError('bad_args', `the name must be a slug of lowercase letters, digits and single hyphens, ${NAME_MAX} characters at most`);
  }
  return db
    .transaction(() => {
      const labels = accountLabels(db);
      const before = labels[key] ?? null;
      if (clear) delete labels[key];
      else labels[key] = name;
      setMeta(db, 'usage_accounts', JSON.stringify(labels));
      logEvent(db, 'hq', 'goals', 'account', actor, before, clear ? null : name, { key });
      return clear ? null : name;
    })
    .immediate();
}
