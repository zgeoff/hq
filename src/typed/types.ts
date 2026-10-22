export interface Typed {
  id: number;
  to_session: string; // as given: a name or an id
  to_id: string | null; // the full atc id, when atc could resolve it
  to_name: string | null;
  text: string;
  source_kind: 'call' | 'proposal' | 'chat' | 'console';

  // The ask or unblock item id, or the typing session's id for chat.
  source_ref: string;

  // Chat only: the transcript time of the owner's message.
  source_at: string | null;
  typed_by: string;
  at: string;
}

export type Source = { kind: 'call' | 'proposal' | 'console'; ref: string; at: null } | { kind: 'chat'; ref: string; at: string };
