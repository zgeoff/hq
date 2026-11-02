import { config } from './config/config.ts';
import { roleName } from './roles/role-name.ts';

export function owner(): string {
  return config().HQ_OWNER ?? roleName('owner');
}
