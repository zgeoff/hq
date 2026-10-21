import { match } from 'ts-pattern';
import { z } from 'zod';
import type { LinearCall } from '../linear/types.ts';
import { toDocumentLookup } from './to-document-lookup.ts';
import type { ConditionVerdict } from './types.ts';

export async function readDocumentVerdict(call: LinearCall, ref: string): Promise<ConditionVerdict> {
  const document = await match(toDocumentLookup(ref))
    .with({ by: 'id' }, (lookup) => readByID(call, lookup.id))
    .with({ by: 'slugID' }, (lookup) => readBySlugID(call, lookup.slugID))
    .exhaustive();
  if (document === 'unexpected') {
    return { kind: 'failed', error: `Linear's answer for doc:${ref} has an unexpected shape` };
  }
  if (document === null) {
    return { kind: 'failed', error: `Linear has no document doc:${ref}` };
  }
  const firstLine = (document.content ?? '').split('\n').find((line) => line.trim() !== '');
  return firstLine?.trim().toLowerCase().startsWith('status: decided') ? { kind: 'settled', what: 'decided' } : { kind: 'waiting' };
}

interface DocumentContent {
  content: string | null;
}

const BY_ID = 'query($id: String!) { document(id: $id) { content } }';

const contentSchema = z.object({ content: z.string().nullable() });

const byIDSchema = z.object({ document: contentSchema.nullable() });

async function readByID(call: LinearCall, id: string): Promise<DocumentContent | null | 'unexpected'> {
  const reply = await call(BY_ID, { id });
  const answer = byIDSchema.safeParse(reply);
  return answer.success ? answer.data.document : 'unexpected';
}

// Linear's schema says `document(id:)` takes an "identifier or slug" without saying which slug, so a
// URL's slug ID is looked up through the documents filter, which names `slugId`.
const BY_SLUG_ID = 'query($slugID: String!) { documents(first: 1, includeArchived: true, filter: { slugId: { eq: $slugID } }) { nodes { content } } }';

const bySlugIDSchema = z.object({ documents: z.object({ nodes: z.array(contentSchema) }) });

async function readBySlugID(call: LinearCall, slugID: string): Promise<DocumentContent | null | 'unexpected'> {
  const reply = await call(BY_SLUG_ID, { slugID });
  const answer = bySlugIDSchema.safeParse(reply);
  return answer.success ? (answer.data.documents.nodes[0] ?? null) : 'unexpected';
}
