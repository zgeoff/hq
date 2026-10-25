export async function readOptionalFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  const exists = await file.exists();
  return exists ? file.text() : null;
}
