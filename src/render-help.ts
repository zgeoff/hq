import { COMMANDS } from './commands.ts';
import type { Command, HelpEntry } from './commands.ts';

// `hq help`: the first line, then each section's lines in table order, a blank line between sections.
export function renderHelp(version: string, commands: readonly Command[] = COMMANDS): string {
  const sections: string[][] = [];
  let previous: string | null = null;
  for (const command of commands) {
    for (const entry of toHelpEntries(command)) {
      if (command.section !== previous) {
        sections.push([]);
      }
      previous = command.section;
      sections.at(-1)?.push(...formatHelpLines(command, entry));
    }
  }
  return [`hq ${version}: headquarters for the z- sessions. Every command takes --json.`, '', sections.map((section) => section.join('\n')).join('\n\n'), '', "Who you are: --by, else HQ_AS, else your atc session's name."].join('\n');
}

function toHelpEntries(command: Command): readonly HelpEntry[] {
  if (command.help === false) {
    return [];
  }
  if (command.help === undefined) {
    return [{}];
  }
  return isHelpList(command.help) ? command.help : [command.help];
}

// Array.isArray does not narrow a readonly array out of a union.
function isHelpList(help: HelpEntry | readonly HelpEntry[]): help is readonly HelpEntry[] {
  return Array.isArray(help);
}

// Where a summary starts when the usage is short enough, and where its later lines start.
const HELP_SUMMARY_COLUMN = 46;
const HELP_CONTINUATION = 45;

function formatHelpLines(command: Command, entry: HelpEntry): string[] {
  const usage = (entry.usage ?? command.usage).split('\n');
  const summary = toSummaryLines(command, entry);
  const lines = usage.map((line) => `  ${line}`);
  const [first, ...rest] = summary;
  if (first === undefined) {
    return lines;
  }
  const continued = rest.map((line) => ' '.repeat(HELP_CONTINUATION) + line);
  if (entry.below) {
    return [...lines, ' '.repeat(HELP_CONTINUATION) + first, ...continued];
  }
  const last = lines.length - 1;
  const lastLine = lines[last] ?? '';
  lines[last] = lastLine + ' '.repeat(entry.pad ?? Math.max(2, HELP_SUMMARY_COLUMN - lastLine.length)) + first;
  return [...lines, ...continued];
}

function toSummaryLines(command: Command, entry: HelpEntry): string[] {
  if (entry.summary === undefined) {
    return [command.summary];
  }
  if (entry.summary === null) {
    return [];
  }
  return typeof entry.summary === 'string' ? [entry.summary] : [...entry.summary];
}
