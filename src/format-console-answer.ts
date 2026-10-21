import { HqError } from './errors.ts';

// The answer string hq stores: `<label> | <note>`, the label alone, or the note
// alone. The note is the owner's words, kept verbatim.
export function formatConsoleAnswer(option: string, note: string): string {
  const hasNote = note.trim() !== '';
  if (option === '' && !hasNote) {
    throw new HqError('bad_args', 'pick an option or write a note');
  }
  if (option === '') {
    return note;
  }
  if (!hasNote) {
    return option;
  }
  return `${option} | ${note}`;
}
