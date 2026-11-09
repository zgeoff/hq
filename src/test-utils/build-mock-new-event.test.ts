import { expect, test } from 'bun:test';
import { buildMockNewEvent } from './build-mock-new-event.ts';

test('it builds a default new event', () => {
  expect(buildMockNewEvent()).toStrictEqual({ subject: 'hq', subjectID: 'kettle', action: 'probe', actor: 'kettle-bot', from: null, to: null, data: {} });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockNewEvent({ subject: 'run', to: 'done', data: { note: 'Descaled.' } })).toStrictEqual({ subject: 'run', subjectID: 'kettle', action: 'probe', actor: 'kettle-bot', from: null, to: 'done', data: { note: 'Descaled.' } });
});
