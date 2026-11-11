import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { listNews } from '../news/list-news.ts';
import { readFleetModel } from './read-fleet-model.ts';
import { runModelCommand } from './run-model-command.ts';
import { writeFleetModel } from './write-fleet-model.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const events = () => fresh.db.query("SELECT action, actor, data FROM events WHERE action = 'model-set'").all();
  const at = new Date('2026-10-14T01:00:00Z');
  return { db: fresh.db, at, events, command: (verb: string | undefined, rest: string[]) => runModelCommand({ db: fresh.db, actor: 'kettle-owner', at, verb, rest }) };
}

test('it gives fable, from the default, when no model is set', () => {
  const ctx = setupTest();

  expect(readFleetModel(ctx.db)).toStrictEqual({ model: 'fable', source: 'default' });
});

test('it stores the model on set with its time and who set it, logs the event and posts one news line', () => {
  const ctx = setupTest();

  const out = ctx.command('set', ['opus']);

  expect(readFleetModel(ctx.db)).toStrictEqual({ model: 'opus', source: 'set', setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' });
  expect(out.data).toStrictEqual({ model: 'opus', source: 'set', setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' });
  expect(ctx.events()).toStrictEqual([{ action: 'model-set', actor: 'kettle-owner', data: '{"model":"opus"}' }]);
  expect(listNews(ctx.db, { all: true, limit: 10 }).map((item) => [item.tag, item.text])).toStrictEqual([
    ['fleet-model', 'Fleet model set: opus. Each session spawn and builder launch uses it from now; running sessions keep their model until they restart.'],
  ]);
});

test('it says on set that the model applies from now and that running sessions keep theirs', () => {
  const ctx = setupTest();

  const out = ctx.command('set', ['opus']);

  expect(out.text).toBe('Each session spawn and builder launch uses this from now; running sessions keep their model until they restart.\nFleet model: opus (set 2026-10-14T01:00:00Z by kettle-owner)');
});

test('it takes any well-formed model name on set, so a new model needs no change to hq', () => {
  const ctx = setupTest();

  const stored = ['claude-opus-5-5', 'opus[1m]', 'fable'].map((name) => ctx.command('set', [name]).data['model']);

  expect(stored).toStrictEqual(['claude-opus-5-5', 'opus[1m]', 'fable']);
});

test.each([[[]], [['opus', 'fable']], [['']], [['Opus']], [['-opus']], [['opus 5']], [['opus/5']]])('it refuses set %j with the usage, and stores nothing', (rest) => {
  const ctx = setupTest();

  expect(() => ctx.command('set', rest)).toThrow('usage: hq model set <model>');

  expect(readFleetModel(ctx.db)).toStrictEqual({ model: 'fable', source: 'default' });
  expect(ctx.events()).toStrictEqual([]);
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it prints the default on show or bare, and its data with no time or setter', () => {
  const ctx = setupTest();

  expect(ctx.command(undefined, [])).toStrictEqual({ data: { model: 'fable', source: 'default', setAt: null, setBy: null }, text: 'Fleet model: fable (default)' });
  expect(ctx.command('show', []).text).toBe('Fleet model: fable (default)');
});

test('it prints a set model on show, with its time and who set it', () => {
  const ctx = setupTest();
  writeFleetModel(ctx.db, { model: 'opus', actor: 'teapot-owner', at: new Date('2026-10-14T02:30:00Z') });

  expect(ctx.command('show', [])).toStrictEqual({
    data: { model: 'opus', source: 'set', setAt: '2026-10-14T02:30:00Z', setBy: 'teapot-owner' },
    text: 'Fleet model: opus (set 2026-10-14T02:30:00Z by teapot-owner)',
  });
});

test('it refuses an argument on show, and an unknown verb', () => {
  const ctx = setupTest();

  expect(() => ctx.command('show', ['opus'])).toThrow('usage: hq model [show]');
  expect(() => ctx.command('clear', [])).toThrow('unknown command: hq model clear');
});
