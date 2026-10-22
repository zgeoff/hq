import { clean } from '../redact/clean.ts';
import { findString as str } from './find-string.ts';
import { parseJSONLine as jsonLine } from './parse-json-line.ts';
import type { Obj, Tool } from './types.ts';

// The tool_use blocks of an assistant line, keyed by tool_use id, and by `a:<record uuid>` when
// the record holds one block (for sourceToolAssistantUUID).
export function collectToolUses(line: string): [string, Tool][] {
  const rec = jsonLine(line);
  return buildUsePairs(rec, findUses(rec));
}

function findUses(rec: Obj | null): Obj[] {
  const c = rec?.['message']?.content;
  if (!Array.isArray(c)) {
    return [];
  }
  return (c as Obj[]).filter((b) => b?.['type'] === 'tool_use' && typeof b['id'] === 'string' && typeof b['name'] === 'string');
}

function buildUsePairs(rec: Obj | null, uses: Obj[]): [string, Tool][] {
  const out: [string, Tool][] = uses.map((b) => [b['id'] as string, { name: b['name'] as string, input: inputOf(b['name'] as string, b['input'] as Obj | undefined) }]),
    uuid = str(rec?.['uuid']),
    [first] = out;
  if (uses.length === 1 && uuid && first !== undefined) {
    out.push([`a:${uuid}`, first[1]]);
  }
  return out;
}

// Bash: the command; a file tool: its path; any other tool shows nothing.
function pickInput(tool: string, input: Obj | undefined): unknown {
  if (tool === 'Bash') {
    return input?.['command'];
  }
  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(tool)) {
    return input?.['file_path'] ?? input?.['notebook_path'];
  }
  return null;
}

function inputOf(tool: string, input: Obj | undefined): string | null {
  const INPUT_CAP = 120;
  const v = pickInput(tool, input);
  return typeof v === 'string' && v.trim() ? clean(v, INPUT_CAP) : null;
}
