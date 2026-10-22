import { config } from '../config/config.ts';
import { roleName } from '../roles/role-name.ts';

export function orchestratorName(): string {
  return config().HQ_ORCHESTRATOR ?? roleName('orchestrator');
}
