import { expect, test } from 'bun:test';
import { pickKeyAction } from './pick-key-action.ts';

function readKeyAction(key: string) {
  return pickKeyAction({ key, inText: false, modified: false });
}

test('the keys outside a text box', () => {
  expect(readKeyAction('1')).toStrictEqual({ kind: 'pick', index: 0 });
  expect(readKeyAction('9')).toStrictEqual({ kind: 'pick', index: 8 });
  expect(readKeyAction('0')).toBeNull();
  expect(readKeyAction('y')).toStrictEqual({ kind: 'ask-stu' });
  expect(readKeyAction('i')).toStrictEqual({ kind: 'note' });
  expect(readKeyAction('j')).toStrictEqual({ kind: 'next' });
  expect(readKeyAction('k')).toStrictEqual({ kind: 'previous' });
  expect(readKeyAction('?')).toStrictEqual({ kind: 'help' });
  expect(readKeyAction('Escape')).toStrictEqual({ kind: 'close' });
});

test('in the note only Esc acts, and a modified key never does', () => {
  expect(pickKeyAction({ key: '1', inText: true, modified: false })).toBeNull();
  expect(pickKeyAction({ key: 'y', inText: true, modified: false })).toBeNull();
  expect(pickKeyAction({ key: 'Escape', inText: true, modified: false })).toStrictEqual({ kind: 'close' });
  expect(pickKeyAction({ key: '1', inText: false, modified: true })).toBeNull();
});
