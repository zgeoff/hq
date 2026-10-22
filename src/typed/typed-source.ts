import type { Typed } from './types.ts';

export function typedSource(t: Typed): string {
  return t.source_kind === 'chat' ? `chat:${t.source_ref}@${t.source_at}` : `${t.source_kind}:${t.source_ref}`;
}
