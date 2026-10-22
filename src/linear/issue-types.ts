export const ISSUE_TYPES = ['Bug', 'Feature', 'Improvement', 'Chore', 'Design', 'Investigation'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number] | 'none';
