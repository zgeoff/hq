const LISTED = 10;

// The first ten files in a sentence, then a count of the rest.
export function formatChangedFiles(files: readonly string[]): string {
  const rest = files.length - LISTED;
  return rest > 0 ? `${files.slice(0, LISTED).join(', ')} and ${rest} more` : files.join(', ');
}
