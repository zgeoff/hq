import { HqError } from '../errors.ts';

const ISSUE_FIELDS = ['id', 'title', 'url', 'status', 'statusType', 'project', 'priority', 'labels', 'parentId', 'createdAt', 'updatedAt', 'completedAt', 'canceledAt', 'description'] as const;

export type IssueField = (typeof ISSUE_FIELDS)[number];

// The fields a `--fields` list names, in the connector's order; no list names all of them.
export function parseIssueFields(raw: string | undefined): IssueField[] {
  if (raw === undefined) {
    return [...ISSUE_FIELDS];
  }
  const asked = raw.split(',').map((name) => name.trim());
  const unknown = asked.filter((name) => !ISSUE_FIELDS.some((field) => field === name));
  if (unknown.length > 0) {
    throw new HqError('bad_args', `--fields: unknown field ${unknown.map((name) => `"${name}"`).join(', ')}; the fields are ${ISSUE_FIELDS.join(', ')}`);
  }
  return ISSUE_FIELDS.filter((field) => asked.includes(field));
}
