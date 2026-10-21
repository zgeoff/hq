export interface OutboxRow {
  id: number;
  event_seq: number;
  target: string;
  text: string;
  idem_key: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  topic: string | null;
  message_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface FlushResult {
  sent: number;
  failed: number;
  dropped: number;
  skipped: boolean;
  errors: string[];
}

export interface DetachResult {
  unit: string | null;
  error: string | null;
}
