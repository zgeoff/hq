import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { clean } from '../redact/clean.ts';
import { findString as str } from './find-string.ts';
import { MARK } from './mark.ts';
import { parseJSONLine as jsonLine } from './parse-json-line.ts';
import type { Found, Obj, Tool } from './types.ts';

export function parseRefusal(line: string, tools: Map<string, Tool>): Found | null {
  const rec = jsonLine(line),
    uuid = str(rec?.['uuid']);
  if (!rec || rec['toolDenialKind'] !== MARK || !uuid) {
    return null;
  }
  return buildFound(rec, uuid, tools);
}

function buildFound(rec: Obj, uuid: string, tools: Map<string, Tool>): Found {
  const block = resultBlock(rec),
    [id, src] = [str(block?.['tool_use_id']), str(rec['sourceToolAssistantUUID'])],
    t = Date.parse(str(rec['timestamp']) ?? ''),
    tool = (id ? tools.get(id) : undefined) ?? (src ? tools.get(`a:${src}`) : undefined);
  return {
    uuid,
    at: Number.isFinite(t) ? iso(new Date(t)) : iso(now()),
    claude_session: str(rec['sessionId']),
    cwd: str(rec['cwd']),
    tool: tool?.name ?? null,
    input: tool?.input ?? null,
    reason: reasonOf(block),
  };
}

function resultBlock(rec: Obj): Obj | null {
  const c = rec['message']?.content;
  return Array.isArray(c) ? ((c as Obj[]).find((b) => b?.['type'] === 'tool_result') ?? null) : null;
}

function readText(c: unknown): string {
  if (typeof c === 'string') {
    return c;
  }
  if (Array.isArray(c)) {
    return (c as Obj[]).map((p) => (typeof p?.['text'] === 'string' ? p['text'] : '')).join('\n');
  }
  return '';
}

function reasonOf(block: Obj | null): string | null {
  const REASON_CAP = 300;
  const m = /Reason: (?<reason>[^\n]*)/u.exec(readText(block?.['content']));
  const r = m ? clean(m[1]!, REASON_CAP) : '';
  return r || null;
}
