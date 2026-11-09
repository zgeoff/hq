interface NoteFacts {
  session: { design_pass: number } | null;
  stored: boolean;
}

export type NoteIngest = 'unmatched' | 'duplicate' | 'store' | 'apply';

export function pickNoteIngest(facts: NoteFacts): NoteIngest {
  if (facts.session === null) {
    return 'unmatched';
  }
  if (facts.stored) {
    return 'duplicate';
  }
  return facts.session.design_pass === 1 ? 'store' : 'apply';
}
