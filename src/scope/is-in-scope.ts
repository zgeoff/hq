import { IN_SCOPE } from './in-scope.ts';

export function isInScope(repo: string): boolean {
  return IN_SCOPE.includes(repo);
}
