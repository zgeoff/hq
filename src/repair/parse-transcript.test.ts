import { expect, test } from 'bun:test';
import { parseTranscript } from './parse-transcript.ts';

test('#parseTranscript keeps a record with a uuid and skips a line without one', () => {
  const text = [JSON.stringify({ uuid: 'u1', type: 'user', parentUuid: null }), JSON.stringify({ type: 'summary' }), '', JSON.stringify({ uuid: 'u2', parentUuid: 'u1' })].join('\n');

  expect(parseTranscript(text).recs.map((rec) => ({ line: rec.line, uuid: rec.obj.uuid }))).toStrictEqual([
    { line: 0, uuid: 'u1' },
    { line: 3, uuid: 'u2' },
  ]);
});

test('#parseTranscript keeps the keys of a record in the order they were written', () => {
  const line = '{"zeta":1,"uuid":"u1","alpha":2,"parentUuid":null}';

  expect(JSON.stringify(parseTranscript(line).recs[0]?.obj)).toBe(line);
});

test('#parseTranscript names the line that is not JSON', () => {
  expect(() => parseTranscript('{"uuid":"u1"}\nnot json')).toThrow(/line 2 is not JSON/u);
});

test.each([[{ uuid: 'u1', parentUuid: 4 }], [{ uuid: 'u1', type: 7 }], [{ uuid: 'u1', isSidechain: 'no' }], [{ uuid: 'u1', message: { id: 3 } }]])('#parseTranscript rejects the mistyped record %j', (record) => {
  expect(() => parseTranscript(JSON.stringify(record))).toThrow(/unexpected type/u);
});
