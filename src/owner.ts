import { config } from './config/config.ts';
import { roleName } from './roles/role-name.ts';

// The session that puts questions to the owner. hq tells it when others file.
export function owner(): string {
  return config().HQ_OWNER ?? roleName('owner');
}
