import { expect, onTestFinished, test } from 'bun:test';
import { readBuild } from '../src/build/read-build.ts';
import { overrideBuild } from './override-build.ts';

test('it sets the build stamp until the restorer runs', () => {
  const restore = overrideBuild({ commit: 'feedc0de', dirty: true });
  onTestFinished(restore);

  expect(readBuild()).toStrictEqual({ commit: 'feedc0de', dirty: true });
});

test('it puts back the stamp that was there before', () => {
  const outer = overrideBuild({ commit: 'cafebabe', dirty: false });
  onTestFinished(outer);
  const inner = overrideBuild({ commit: 'feedc0de', dirty: true });

  inner();

  expect(readBuild()).toStrictEqual({ commit: 'cafebabe', dirty: false });
});

test('it clears the stamp when given none, as in a run from source', () => {
  const outer = overrideBuild({ commit: 'cafebabe', dirty: false });
  onTestFinished(outer);
  const inner = overrideBuild(undefined);

  const cleared = readBuild();
  inner();

  expect(cleared).toStrictEqual({ commit: null, dirty: null });
});
