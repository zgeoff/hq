import { HqError } from './errors.ts';

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
