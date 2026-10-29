import { expect, test } from 'bun:test';
import { formatDesignLanes } from './format-design-lanes.ts';

test('it prints each lane against its count, with the next issues and where the owner asked', () => {
  const line = formatDesignLanes({ countsError: null, agent: { open: 0, slots: 2, next: ['GEO-9801', 'GEO-9802'] }, withGeoff: { open: 2, slots: 1, next: ['GEO-9803'], asked: ['chat 29 Oct', 'review 30 Oct'] } });

  expect(line).toBe('design: agent 0/2 (next GEO-9801, GEO-9802), with-geoff 2/1 (next GEO-9803, waiting; asked: chat 29 Oct; review 30 Oct)');
});

test('it prints a bare count for a lane with nothing waiting', () => {
  const line = formatDesignLanes({ countsError: null, agent: { open: 2, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });

  expect(line).toBe('design: agent 2/2, with-geoff 0/1');
});

test('it prints that the counts are unreadable and the defaults it uses', () => {
  const line = formatDesignLanes({ countsError: 'pacing.json: agentDesignSlots is wrong', agent: { open: 1, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });

  expect(line).toBe('design: counts unreadable (pacing.json: agentDesignSlots is wrong), using agent 2, with-geoff 1');
});
