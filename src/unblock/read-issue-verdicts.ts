import { z } from 'zod';
import type { LinearCall } from '../linear/types.ts';
import type { ConditionVerdict } from './types.ts';

const BATCH = 100;

export async function readIssueVerdicts(call: LinearCall, refs: string[]): Promise<Map<string, ConditionVerdict>> {
  const verdicts = new Map<string, ConditionVerdict>();
  for (let from = 0; from < refs.length; from += BATCH) {
    const batch = refs.slice(from, from + BATCH);
    try {
      const states = await readStates(call, batch);
      for (const ref of batch) {
        verdicts.set(ref, pickVerdict(ref, states.get(ref)));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      for (const ref of batch) {
        verdicts.set(ref, { kind: 'failed', error: `can't read issue:${ref}: ${reason}` });
      }
    }
  }
  return verdicts;
}

const QUERY = `query($ids: [ID!]) {
  issues(first: ${BATCH}, includeArchived: true, filter: { id: { in: $ids } }) {
    nodes { identifier previousIdentifiers state { type } }
  }
}`;

const nodeSchema = z.object({ identifier: z.string(), previousIdentifiers: z.array(z.string()), state: z.object({ type: z.string() }) });
const answerSchema = z.object({ issues: z.object({ nodes: z.array(nodeSchema) }) });

async function readStates(call: LinearCall, ids: string[]): Promise<Map<string, string>> {
  const reply = await call(QUERY, { ids });
  const answer = answerSchema.safeParse(reply);
  if (!answer.success) {
    throw new Error("Linear's issue answer has an unexpected shape");
  }

  // An issue moved to another team answers under its new identifier and lists the asked one among
  // its previous identifiers.
  return new Map(answer.data.issues.nodes.flatMap((node) => [node.identifier, ...node.previousIdentifiers].map((identifier) => [identifier.toUpperCase(), node.state.type] as const)));
}

function pickVerdict(ref: string, type: string | undefined): ConditionVerdict {
  if (type === undefined) {
    return { kind: 'failed', error: `Linear has no issue ${ref}` };
  }
  if (type === 'completed') {
    return { kind: 'settled', what: 'Done' };
  }
  return type === 'canceled' ? { kind: 'settled', what: 'Canceled' } : { kind: 'waiting' };
}
