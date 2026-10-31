import { expect, test } from 'bun:test';
import { fillPlaceholders } from './fill-placeholders.ts';

test('it fills the placeholders it has values for, and names each one it lacks once', () => {
  const filled = fillPlaceholders('Boil {{issue_id}} in {{repo}}. {{lid}} and {{lid}} again.', { issue_id: 'GEO-9001', repo: 'zgeoff/kettle' });

  expect(filled).toStrictEqual({ text: 'Boil GEO-9001 in zgeoff/kettle. {{lid}} and {{lid}} again.', unknown: ['lid'] });
});

test('it fills in one pass, so a value that holds a placeholder is printed as it is', () => {
  expect(fillPlaceholders('{{spout}}', { spout: '{{lid}}', lid: 'brass' })).toStrictEqual({ text: '{{lid}}', unknown: [] });
});

test('it takes a name an object inherits, such as constructor, as unknown', () => {
  expect(fillPlaceholders('A {{constructor}} kettle.', {})).toStrictEqual({ text: 'A {{constructor}} kettle.', unknown: ['constructor'] });
});
