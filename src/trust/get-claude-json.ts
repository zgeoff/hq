import { config } from '../config/config.ts';

// Claude Code keeps it in $CLAUDE_CONFIG_DIR/.claude.json when that is set, else ~/.claude.json.
export function getClaudeJson(): string {
  return config().HQ_CLAUDE_JSON ?? (process.env['CLAUDE_CONFIG_DIR'] ? `${process.env['CLAUDE_CONFIG_DIR']}/.claude.json` : `${process.env['HOME']}/.claude.json`);
}
