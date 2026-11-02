export interface Typed {
  id: number;
  to_session: string;
  to_id: string | null;
  to_name: string | null;
  text: string;
  source_kind: 'call' | 'proposal' | 'chat' | 'console';

  source_ref: string;

  source_at: string | null;
  typed_by: string;
  at: string;
}

export type Source = { kind: 'call' | 'proposal' | 'console'; ref: string; at: null } | { kind: 'chat'; ref: string; at: string };
