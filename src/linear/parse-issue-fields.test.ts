import { expect, test } from 'bun:test';
import { parseIssueFields } from './parse-issue-fields.ts';

test('it reads no list as every field, in the connector order', () => {
  expect(parseIssueFields(undefined)).toStrictEqual(['id', 'title', 'url', 'status', 'statusType', 'project', 'priority', 'labels', 'parentId', 'createdAt', 'updatedAt', 'completedAt', 'canceledAt', 'description']);
});

test('it reads a list in the connector order, trimming each name', () => {
  expect(parseIssueFields('updatedAt, title ,id')).toStrictEqual(['id', 'title', 'updatedAt']);
});

test('it refuses unknown fields, naming each one and every field', () => {
  expect(() => parseIssueFields('id,colour,Title')).toThrow(
    expect.objectContaining({
      code: 'bad_args',
      message: '--fields: unknown field "colour", "Title"; the fields are id, title, url, status, statusType, project, priority, labels, parentId, createdAt, updatedAt, completedAt, canceledAt, description',
    }),
  );
});
