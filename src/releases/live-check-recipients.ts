import { config } from '../config/config.ts';
import { roleName } from '../roles/role-name.ts';

export const liveCheckRecipients = (): string[] =>
  (config().HQ_LIVECHECK_TO ?? roleName('qa'))
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
