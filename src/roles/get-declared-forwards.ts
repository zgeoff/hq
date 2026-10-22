import { ROLES } from './roles.ts';

export function getDeclaredForwards(): Record<string, string> {
  return ROLES.forwards;
}
