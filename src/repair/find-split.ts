import { HqError } from '../errors.ts';
import type { Rec, Split } from './types.ts';

type Block = { type?: string; id?: string; tool_use_id?: string };

const blocks = (r: Rec): Block[] => (Array.isArray(r.obj.message?.content) ? (r.obj.message!.content as Block[]) : []);

export function findSplit(byUuid: Map<string, Rec>, recs: Rec[], path: Rec[], offBranch: Set<string>): Split | null {
  const uses = new Map<string, Rec>();
  for (const r of recs) for (const b of blocks(r)) if (b.type === 'server_tool_use' && b.id) uses.set(b.id, r);
  const onPath = new Map(path.map((r, i) => [r.obj.uuid, i]));
  for (const r of recs) {
    for (const b of blocks(r)) {
      if (b.type !== 'advisor_tool_result' || !b.tool_use_id) continue;
      const use = uses.get(b.tool_use_id);
      if (!use || r.obj.parentUuid === use.obj.uuid) continue;
      const between: Rec[] = [];
      const seen = new Set<string>([r.obj.uuid]);
      let p = r.obj.parentUuid ? byUuid.get(r.obj.parentUuid) : undefined;
      while (p && p.obj.uuid !== use.obj.uuid && !seen.has(p.obj.uuid)) {
        seen.add(p.obj.uuid);
        between.unshift(p);
        p = p.obj.parentUuid ? byUuid.get(p.obj.parentUuid) : undefined;
      }
      if (p?.obj.uuid !== use.obj.uuid) continue; // the result does not descend from its use: not this fault
      if (!onPath.has(r.obj.uuid)) {
        offBranch.add(r.obj.uuid);
        continue;
      }
      const msg = use.obj.message?.id;
      for (const x of between) {
        const toolResult = blocks(x).some((y) => y.type === 'tool_result');
        if ((x.obj.type === 'assistant' && x.obj.message?.id === msg) || toolResult) {
          throw new HqError('unknown_shape', `record ${x.obj.uuid} (line ${x.line + 1}) sits between advisor use ${use.obj.uuid} and its result but belongs to the turn; hq repairs only an interloper from outside the turn`);
        }
      }
      // The turn: the result, then the same message's records and the tool_results for its tool_uses.
      const toolUses = new Set<string>();
      let i = onPath.get(r.obj.uuid)!;
      for (;;) {
        const next = path[i + 1];
        if (!next) break;
        const sameMsg = next.obj.type === 'assistant' && next.obj.message?.id === msg;
        const bs = blocks(next);
        const answers = next.obj.type === 'user' && bs.length > 0 && bs.every((y) => y.type === 'tool_result' && y.tool_use_id && toolUses.has(y.tool_use_id));
        if (!sameMsg && !answers) break;
        if (sameMsg) for (const y of bs) if (y.type === 'tool_use' && y.id) toolUses.add(y.id);
        i++;
      }
      // With nothing after the turn, the moved record would hang off the live branch and drop out of context.
      if (!path[i + 1]) throw new HqError('unknown_shape', `the turn of advisor use ${use.obj.uuid} ends the transcript, so the record between would leave the live branch; hq does not repair this shape: relaunch the session`);
      return { use: use.obj.uuid, result: r.obj.uuid, interlopers: between.map((x) => x.obj.uuid), anchor: path[i]!.obj.uuid };
    }
  }
  return null;
}
