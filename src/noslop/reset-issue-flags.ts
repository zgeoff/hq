import { flagByClone } from './flag-by-clone.ts';

export function resetIssueFlags(): void {
  flagByClone.clear();
}
