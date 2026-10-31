import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { stateDir } from './state-dir.ts';

test('it uses HQ_STATE_DIR when it is set', () => {
  onTestFinished(overrideEnv('HQ_STATE_DIR', '/srv/kettle-state'));

  expect(stateDir()).toBe('/srv/kettle-state');
});

test('it falls back to the z-sessions folder under HOME when HQ_STATE_DIR is unset', () => {
  onTestFinished(overrideEnv('HQ_STATE_DIR', undefined));
  onTestFinished(overrideEnv('HOME', '/home/kettle'));

  expect(stateDir()).toBe('/home/kettle/.local/share/z-sessions');
});
