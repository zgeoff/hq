import { expect, test } from 'bun:test';
import { findParentUUID } from './find-parent-uuid.ts';

test('it finds the parent of the record with the given uuid', () => {
  const transcript = ['{"uuid":"kettle-1","parentUuid":null}', '{"type":"queue-operation"}', '{"uuid":"kettle-2","parentUuid":"kettle-1"}', ''].join('\n');

  expect(findParentUUID(transcript, 'kettle-2')).toBe('kettle-1');
});

test('it finds a null parent for a root record', () => {
  const transcript = '{"uuid":"kettle-1","parentUuid":null}\n';

  expect(findParentUUID(transcript, 'kettle-1')).toBeNull();
});

test('it finds nothing for a uuid no record has', () => {
  const transcript = '{"uuid":"kettle-1","parentUuid":null}\n';

  expect(findParentUUID(transcript, 'teapot-9')).toBeUndefined();
});
