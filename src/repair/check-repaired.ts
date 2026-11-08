import { z } from 'zod';
import { HqError } from '../errors.ts';
import { parseJSON } from '../noslop/parse-json.ts';
import { collectBranch as branch } from './collect-branch.ts';
import { findSplit } from './find-split.ts';
import { parseTranscript as parse } from './parse-transcript.ts';

const LastPromptSchema = z.object({ type: z.string().optional(), leafUuid: z.string().optional() });

export function checkRepaired(text: string): { ok: true; leaf: string | null; promptLeaf: string | null } {
  const { recs } = parse(text);
  const byUuid = new Map(recs.map((r) => [r.obj.uuid, r]));
  const path = branch(byUuid, recs);
  const off = new Set<string>();
  if (findSplit(byUuid, recs, path, off)) throw new HqError('repair_failed', 'a split advisor result is still on the live branch');
  let promptLeaf: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.includes('"last-prompt"')) {
      continue;
    }
    const entry = LastPromptSchema.safeParse(parseJSON(line)).data;
    if (entry?.type === 'last-prompt' && entry.leafUuid) {
      promptLeaf = entry.leafUuid;
    }
  }
  if (promptLeaf && !path.some((r) => r.obj.uuid === promptLeaf)) throw new HqError('repair_failed', `the last-prompt leaf ${promptLeaf} is not on the live branch`);
  return { ok: true, leaf: path.at(-1)?.obj.uuid ?? null, promptLeaf };
}
