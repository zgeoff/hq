import { isRecord } from '@zgeoff/std';
import { NO_TMP } from './no-tmp.ts';

// A -c override replaces the config's developer_instructions, so pass the owner's own (read at run
// time) with the sentence added.
export async function codexInstructions(): Promise<string> {
  const path = `${process.env['CODEX_HOME'] ?? `${process.env['HOME']}/.codex`}/config.toml`;
  let own: unknown;
  try {
    const text = await Bun.file(path).text();
    const config: unknown = Bun.TOML.parse(text);
    own = isRecord(config) ? config['developer_instructions'] : undefined;
  } catch {}
  return typeof own === 'string' && own.trim() ? `${own.trimEnd()}\n\n${NO_TMP}` : NO_TMP;
}
