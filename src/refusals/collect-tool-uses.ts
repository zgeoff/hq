import { z } from 'zod';
import { clean } from '../redact/clean.ts';
import { findString as str } from './find-string.ts';
import { parseJSONLine as jsonLine } from './parse-json-line.ts';
import type { Obj, Tool } from './types.ts';

// A record that holds one block is also keyed by `a:<record uuid>`, for sourceToolAssistantUUID.
export function collectToolUses(line: string): [string, Tool][] {
  const record = jsonLine(line);
  return buildUsePairs(record, collectUses(record));
}

const ToolUseBlock = z.object({ type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.unknown() });

type ToolUse = z.infer<typeof ToolUseBlock>;

function buildUsePairs(record: Obj | null, uses: ToolUse[]): [string, Tool][] {
  const out: [string, Tool][] = uses.map((use) => [use.id, { name: use.name, input: inputOf(use.name, use.input) }]);
  const uuid = str(record?.['uuid']);
  const [first] = out;
  if (uses.length === 1 && uuid && first !== undefined) {
    out.push([`a:${uuid}`, first[1]]);
  }
  return out;
}

function inputOf(tool: string, input: unknown): string | null {
  const INPUT_CAP = 120;
  const value = pickInput(tool, input);
  return typeof value === 'string' && value.trim() ? clean(value, INPUT_CAP) : null;
}

const ToolInput = z.record(z.string(), z.unknown());

function pickInput(tool: string, input: unknown): unknown {
  const parsed = ToolInput.safeParse(input);
  const fields = parsed.success ? parsed.data : {};
  if (tool === 'Bash') {
    return fields['command'];
  }
  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(tool)) {
    return fields['file_path'] ?? fields['notebook_path'];
  }
  return null;
}

function collectUses(record: Obj | null): ToolUse[] {
  const content: unknown = record?.['message']?.content;
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block: unknown) => {
    const parsed = ToolUseBlock.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}
