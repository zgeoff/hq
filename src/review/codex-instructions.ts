import { NO_TMP } from './no-tmp.ts';

// A -c override replaces the config's developer_instructions, so pass the owner's own (read at run
// time) with the sentence added. No config, no value, or a config that won't parse: the sentence alone.
export async function codexInstructions(): Promise<string> {
  const path = `${process.env['CODEX_HOME'] ?? `${process.env['HOME']}/.codex`}/config.toml`;
  let own: unknown;
  try {
    own = (Bun.TOML.parse(await Bun.file(path).text()) as { developer_instructions?: unknown }).developer_instructions;
  } catch {}
  return typeof own === 'string' && own.trim() ? `${own.trimEnd()}\n\n${NO_TMP}` : NO_TMP;
}
