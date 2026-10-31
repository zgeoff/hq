import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dir, '..');

// A checkout the script reads and writes. `name` is set only with --private, so every error and
// diff says which of the two trees a file came from; without it the output is as it always was.
interface Tree {
  name: string | null;
  root: string;
}
type Voice = 'first' | 'third';
interface Item {
  id: string;
  outcome: 'ask';
  note: string;
  note_first?: string;
}
interface Grant {
  id: string;
  label: string;
  outcome: 'allow';
  note: string;
}

function parseObject(value: unknown, keys: string[], where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new Error(`${where}: unexpected field ${key}`);
    }
  }
  return value as Record<string, unknown>;
}

function parseText(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/u.test(value)) {
    throw new Error(`${where}: expected one nonempty line`);
  }
  return value;
}

function parseEntries(value: unknown, outcome: 'ask' | 'allow', where: string): (Item | Grant)[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where}: expected a nonempty list`);
  }
  const ids = new Set<string>();
  return value.map((entry, i) => {
    const at = `${where}[${i}]`,
      fields = outcome === 'ask' ? ['id', 'outcome', 'note', 'note_first'] : ['id', 'label', 'outcome', 'note'],
      row = parseObject(entry, fields, at),
      slug = parseText(row.id, `${at}.id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || ids.has(slug)) {
      throw new Error(`${at}: id must be a unique slug`);
    }
    ids.add(slug);
    if (row.outcome !== outcome) {
      throw new Error(`${at}: outcome must be ${outcome}`);
    }
    {
      const note = parseText(row.note, `${at}.note`);
      if (outcome === 'allow') {
        if (/deleting or rewriting\b[^\n]*?\bsecurity change\b/u.test(note)) {
          throw new Error(`${at}.note: use {still-ask} instead of a literal still-ask list`);
        }
        return { id: slug, outcome, note, label: parseText(row.label, `${at}.label`) };
      }
      return {
        id: slug,
        outcome,
        note,
        ...(row.note_first === undefined ? {} : { note_first: parseText(row.note_first, `${at}.note_first`) }),
      };
    }
  });
}

function read(tree: Tree, file: string): string {
  return readFileSync(join(tree.root, file), 'utf8');
}

function collectFiles(tree: Tree, folder: string): string[] {
  if (!existsSync(join(tree.root, folder))) {
    return [];
  }
  return [...new Bun.Glob('**/*').scanSync({ cwd: join(tree.root, folder), onlyFiles: true })]
    .toSorted()
    .map((file) => `${folder}/${file}`);
}

function formatList(notes: string[]): string {
  return `${notes.slice(0, -1).join(', ')}, and ${notes.at(-1)}`;
}

// A single hunk with common context also covers multiple edits in the same file.
function renderDiff(file: string, before: string, after: string): string {
  const newLines = after.split('\n'),
    oldLines = before.split('\n');
  let endNew = newLines.length,
    endOld = oldLines.length,
    start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--;
    endNew--;
  }
  {
    const context = Math.min(3, oldLines.length - endOld),
      from = Math.max(0, start - 3);
    return [
      `--- a/${file}`,
      `+++ b/${file}`,
      `@@ -${from + 1},${endOld + context - from} +${from + 1},${endNew + context - from} @@`,
      ...oldLines.slice(from, start).map((line) => ` ${line}`),
      ...oldLines.slice(start, endOld).map((line) => `-${line}`),
      ...newLines.slice(start, endNew).map((line) => `+${line}`),
      ...oldLines.slice(endOld, endOld + context).map((line) => ` ${line}`),
    ].join('\n');
  }
}

interface StillAsk {
  afters: Map<string, string>;

  // The owner's other calls, which a site may list as bullets under "Also his:" after the sentence.
  also: string[] | undefined;
  dataFile: string;

  // The sites marked `tree: private`, which hq-private holds and hq's public check skips.
  privateSites: Set<string>;
  sites: Map<string, Voice>;
  textByVoice: Record<Voice, string>;
}

function buildStillAsk(dataFile: string, entries: unknown[], items: Item[], also: string[] | undefined): StillAsk {
  const afters = new Map<string, string>(),
    getNotes = (voice: Voice) => items.map((item) => (voice === 'first' ? (item.note_first ?? item.note) : item.note)),
    privateSites = new Set<string>(),
    sites = new Map<string, Voice>(),
    textByVoice = { first: formatList(getNotes('first')), third: formatList(getNotes('third')) };
  for (const entry of entries) {
    const row = parseObject(entry, ['file', 'voice', 'after', 'tree'], `${dataFile}.sites`),
      site = parseText(row.file, 'site.file'),
      voice = site.endsWith('/references/session-prompt.md') ? 'first' : 'third';
    if (!/^(?:skills|docs)\//u.test(site) || site.split('/').includes('..') || sites.has(site)) {
      throw new Error(`invalid or duplicate site: ${site}`);
    }
    if (row.voice !== voice) {
      throw new Error(`${site}: expected ${voice} voice`);
    }
    if (row.tree !== undefined && row.tree !== 'private') {
      throw new Error(`${site}: tree must be private, or left out for a site hq holds`);
    }
    if (row.tree === 'private') {
      privateSites.add(site);
    }
    sites.set(site, voice);
    afters.set(site, parseText(row.after, 'site.after'));
  }

  // The span regex below needs unique boundary phrases to keep writes idempotent.
  for (const voice of ['first', 'third'] as const) {
    if (!textByVoice[voice].startsWith('deleting or rewriting') || !textByVoice[voice].endsWith('security change')) {
      throw new Error(
        `${dataFile}: the still-ask list must start with "deleting or rewriting" and end with "security change"; change the span in grants.ts with it`,
      );
    }
    if (
      textByVoice[voice].indexOf('security change') !== textByVoice[voice].length - 'security change'.length ||
      textByVoice[voice].lastIndexOf('deleting or rewriting') !== 0
    ) {
      throw new Error(
        `${dataFile}: the ${voice}-voice still-ask list must contain "deleting or rewriting" only at its start and "security change" only at its end`,
      );
    }
  }
  return { afters, also, dataFile, privateSites, sites, textByVoice };
}

function readStillAsk(tree: Tree): StillAsk {
  const dataFile = 'grants/still-ask.yaml',
    model = parseObject(Bun.YAML.parse(read(tree, dataFile)), ['items', 'also', 'sites'], dataFile),
    stillAsk = parseEntries(model.items, 'ask', `${dataFile}.items`) as Item[];
  if (!Array.isArray(model.sites) || model.sites.length === 0) {
    throw new Error(`${dataFile}: expected sites`);
  }
  const also = model.also === undefined ? undefined : parseAlso(model.also, `${dataFile}.also`);
  return buildStillAsk(dataFile, model.sites, stillAsk, also);
}

// Each item is stored bare: the check adds the bullet and the closing ";" or ".".
function parseAlso(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where}: expected a nonempty list`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const at = `${where}[${index}]`;
    const text = parseText(entry, at);
    if (text !== text.trim() || /^- |[;.]$/u.test(text)) {
      throw new Error(`${at}: give the item without its "- " bullet, closing ";" or ".", or surrounding spaces`);
    }
    if (seen.has(text)) {
      throw new Error(`${at}: duplicate item ${JSON.stringify(text)}`);
    }
    seen.add(text);
    return text;
  });
}

// Check the source sites before grant replacement can conceal a missing or extra span.
function normalizeSite(file: string, body: string, data: StillAsk): string {
  const mentions = [...body.matchAll(/security change/gu)].length,
    spans = [...body.matchAll(/deleting or rewriting\b[^\n]*?\bsecurity change\b/gu)],
    voice = data.sites.get(file);
  if (mentions !== spans.length || spans.length !== (voice ? 1 : 0)) {
    throw new Error(
      `${file}: expected ${voice ? 'one still-ask span' : 'no security change outside the listed sites'}; found ${spans.length} spans and ${mentions} security change mentions`,
    );
  }
  let next = body;
  for (const span of spans) {
    const tail = /^[^.)]*[.)]/u.exec(body.slice(span.index + span[0].length))?.[0] ?? '';

    // The text after the list, up to its sentence end, is pinned too, so a qualifier added
    // after the last item can't narrow one copy unseen.
    if (tail !== data.afters.get(file)) {
      throw new Error(
        `${file}: the still-ask list is followed by ${JSON.stringify(tail)}, not ${JSON.stringify(data.afters.get(file))} as grants/still-ask.yaml pins`,
      );
    }
    if (data.also) {
      next = renderAlso(file, body, span.index + span[0].length + tail.length, data.also);
    }
  }
  return voice
    ? next.replaceAll(/deleting or rewriting\b[^\n]*?\bsecurity change\b/gu, () => data.textByVoice[voice])
    : next;
}

const ALSO_HEAD = '\n\nAlso his:\n\n';
const ALSO_WIDTH = 100;

// A site opts in by following the still-ask sentence with "Also his:"; its bullet list, up to the
// next blank line, must then hold `also` in order. A list that matches once its wrapped lines are
// joined is left as written; any other list is replaced with `also`, wrapped at 100 columns.
function renderAlso(file: string, body: string, at: number, also: string[]): string {
  if (!body.startsWith(ALSO_HEAD, at)) {
    return body;
  }
  const start = at + ALSO_HEAD.length;
  // A line that holds only spaces or tabs ends the list as an empty line does.
  const blank = /\n[ \t]*\n/u.exec(body.slice(start));
  const end = blank === null ? body.length - (body.endsWith('\n') ? 1 : 0) : start + blank.index;
  const expected = also.map((item, index) => `- ${item}${index === also.length - 1 ? '.' : ';'}`);
  const found = parseAlsoList(body.slice(start, end));

  // A bullet after a blank line would escape the list and the check; refuse it.
  if (/^\n(?:[ \t]*\n)+[ \t]*- /u.test(body.slice(end))) {
    throw new Error(`${file}: a "- " line follows the "Also his:" list after a blank line; keep every item in the list`);
  }
  if (found.length === expected.length && found.every((item, index) => item === expected[index])) {
    return body;
  }
  return body.slice(0, start) + expected.map((item) => renderBullet(item.slice(2))).join('\n') + body.slice(end);
}

// Each item keeps its "- " marker. A line that is neither a bullet nor a continuation is kept
// whole as an item, so it fails the comparison and a write run replaces it.
function parseAlsoList(block: string): string[] {
  const items: string[] = [];
  for (const line of block === '' ? [] : block.split('\n')) {
    if (line.startsWith('- ')) {
      items.push(line);
    } else if (/^ {2}\S/u.test(line) && items.length > 0) {
      items.push(`${items.pop() ?? ''} ${line.slice(2)}`);
    } else {
      items.push(line);
    }
  }
  return items;
}

function renderBullet(item: string): string {
  const lines: string[] = [];
  let line = '-';
  for (const word of item.split(' ')) {
    if (line.length > 2 && line.length + 1 + word.length > ALSO_WIDTH) {
      lines.push(line);
      line = ' ';
    }
    line = `${line} ${word}`;
  }
  lines.push(line);
  return lines.join('\n');
}

interface SessionContext {
  data: StillAsk;
  grants: Grant[];
}

function renderSessionGrants(file: string, body: string, block: RegExpExecArray, context: SessionContext): string {
  const content = block.groups?.['content'] ?? '',
    matches = [...content.matchAll(/^Grants:\n[\s\S]*?\n\n/gmu)],
    [span] = matches;
  if (matches.length !== 1 || !span) {
    throw new Error(`${file}: expected one Grants block ending with a blank line`);
  }
  {
    const notes = context.grants.map((grant) => {
        const note = grant.note.replaceAll(
          '{still-ask}',
          () => context.data.textByVoice[context.data.sites.get(file) ?? 'first'],
        );
        return `- ${grant.label}: ${note}`;
      }),
      rendered = `Grants:\n${notes.join('\n')}\n\n`,
      rest = content.slice(span.index + span[0].length),
      updatedBlock = block[0].replace(span[0], () => rendered),
      updatedBody = body.slice(0, block.index) + updatedBlock + body.slice(block.index + block[0].length);

    // A bullet after a blank line would escape the block and the check; refuse it.
    if (/^- /mu.test(rest)) {
      throw new Error(
        `${file}: a "- " line follows the Grants block after a blank line; keep every grant in the block`,
      );
    }
    return updatedBody;
  }
}

interface RenderContext {
  data: StillAsk;
  grantsBySession: Map<string, Grant[]>;
  sessions: Set<string>;
}

function renderSession(file: string, body: string, context: RenderContext): string | undefined {
  if (!/^skills\/[^/]+\/references\/session-prompt\.md$/u.test(file)) {
    return undefined;
  }
  const blocks = [...body.matchAll(/^```text\n(?<content>[\s\S]*?)^```[ \t]*$/gmu)],
    session = /The start prompt for `(?<name>z-[a-z0-9-]+)`/u.exec(body)?.groups?.['name'],
    withGrants = blocks.filter((block) => /^Grants:$/mu.test(block.groups?.['content'] ?? ''));
  if (withGrants.length === 0) {
    return undefined;
  }
  if (blocks.length !== 1 || withGrants.length !== 1 || !withGrants[0]) {
    throw new Error(`${file}: expected one text block`);
  }
  if (!session || context.sessions.has(session)) {
    throw new Error(`${file}: missing or duplicate session name`);
  }
  context.sessions.add(session);
  return renderSessionGrants(file, body, withGrants[0], {
    data: context.data,
    grants: getSessionGrants(file, session, context),
  });
}

function getSessionGrants(file: string, session: string, context: RenderContext): Grant[] {
  const grants = context.grantsBySession.get(session);
  if (!grants) {
    throw new Error(`${file}: no grants/${session}.yaml for this prompt's Grants block`);
  }
  return grants;
}

function readGrants(data: StillAsk, tree: Tree): Map<string, Grant[]> {
  const grantsBySession = new Map<string, Grant[]>();
  for (const file of collectFiles(tree, 'grants')) {
    if (file === data.dataFile) {
      if (tree.name === 'hq-private') {
        throw new Error(`${file}: the still-ask list stays in hq; remove it here`);
      }
      continue;
    }
    if (!file.endsWith('.yaml')) {
      throw new Error(`${file}: no matching session prompt`);
    }
    const parsed: unknown = Bun.YAML.parse(read(tree, file));
    grantsBySession.set(file.slice('grants/'.length, -'.yaml'.length), parseEntries(parsed, 'allow', file) as Grant[]);
  }
  return grantsBySession;
}

interface Generated {
  file: string;
  next: string;
  original: string;
  tree: Tree;
}

function formatFile(tree: Tree, file: string): string {
  return tree.name === null ? file : `${tree.name}:${file}`;
}

// Name the tree in an error, so a failure in a two-tree run says where the file lives.
function withTree<T>(tree: Tree, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw tree.name === null || !(error instanceof Error) ? error : new Error(`${tree.name}: ${error.message}`);
  }
}

function writeGenerated(generated: Generated[], check: boolean): number {
  let changed = 0;
  for (const entry of generated) {
    if (entry.original === entry.next) {
      continue;
    }
    changed++;
    if (check) {
      console.log(renderDiff(formatFile(entry.tree, entry.file), entry.original, entry.next));
    } else {
      writeFileSync(join(entry.tree.root, entry.file), entry.next);
    }
  }
  if (check && changed) {
    return 1;
  }
  const message = check
    ? `grants: ${generated.length} files match`
    : `grants: wrote ${changed} files (${generated.length} generated files)`;
  console.log(message);
  return 0;
}

interface Trees {
  all: Tree[];
  hq: Tree;
  prompts: Tree;
}

interface Held {
  originals: Map<string, string>;
  tree: Tree;
}

function buildTrees(privateDir: string | undefined): Trees {
  if (privateDir === undefined) {
    const only: Tree = { name: null, root };
    return { all: [only], hq: only, prompts: only };
  }
  const hq: Tree = { name: 'hq', root },
    prompts: Tree = { name: 'hq-private', root: resolve(privateDir) };
  if (!existsSync(prompts.root)) {
    throw new Error(`--private ${prompts.root}: no such directory`);
  }
  requirePrivateFiles(prompts);
  return { all: [hq, prompts], hq, prompts };
}

// The listed sites still pass through hq's copies, so an empty or wrong private dir would pass the
// check with nothing in it checked.
function requirePrivateFiles(tree: Tree): void {
  const grants = collectFiles(tree, 'grants').filter((file) => file.endsWith('.yaml') && file !== 'grants/still-ask.yaml'),
    prompts = [...new Bun.Glob('skills/*/references/session-prompt.md').scanSync({ cwd: tree.root, onlyFiles: true })];
  {
    const missing = [
      ...(grants.length === 0 ? ['grants (grants/<session>.yaml)'] : []),
      ...(prompts.length === 0 ? ['session prompts (skills/*/references/session-prompt.md)'] : []),
    ];
    if (missing.length > 0) {
      throw new Error(`--private ${tree.root}: holds no ${missing.join(' and no ')}; is it the hq-private checkout?`);
    }
  }
}

function readHeld(tree: Tree): Held {
  const files = [...collectFiles(tree, 'skills'), ...collectFiles(tree, 'docs')];
  return { originals: new Map(files.map((file) => [file, read(tree, file)])), tree };
}

// Every tree is checked for the still-ask span, and a listed site is regenerated in each tree that holds it.
function collectSites(held: Held[], data: StillAsk): Generated[] {
  const generated: Generated[] = [];
  for (const entry of held) {
    for (const [file, body] of entry.originals) {
      const next = withTree(entry.tree, () => normalizeSite(file, body, data));
      if (data.sites.has(file)) {
        generated.push({ file, next, original: body, tree: entry.tree });
      }
    }
  }
  return generated;
}

// Only the tree that holds the session prompts gets Grants blocks.
function renderSessions(entry: Held, context: RenderContext, generated: Generated[]): void {
  for (const [file, body] of entry.originals) {
    const next = withTree(entry.tree, () => renderSession(file, body, context));
    if (next !== undefined) {
      const existing = generated.find((item) => item.tree === entry.tree && item.file === file),
        final = withTree(entry.tree, () => normalizeSite(file, next, context.data));
      if (existing) {
        existing.next = final;
      } else {
        generated.push({ file, next: final, original: body, tree: entry.tree });
      }
    }
  }
}

function runTrees(trees: Trees, check: boolean): number {
  const data = readStillAsk(trees.hq),
    grantsBySession = withTree(trees.prompts, () => readGrants(data, trees.prompts)),
    held = trees.all.map((tree) => readHeld(tree)),
    sessions = new Set<string>();
  for (const file of data.sites.keys()) {
    requireSite(file, trees, held, data);
  }
  return writeGenerated(renderTrees(trees, held, { data, grantsBySession, sessions }), check);
}

// A private site must be in hq-private, and hq's public check skips it when hq no longer holds it;
// any other site must be in a tree the run reads.
function requireSite(file: string, trees: Trees, held: Held[], data: StillAsk): void {
  const isPrivate = data.privateSites.has(file);
  if (isPrivate && trees.all.length > 1 && !held.some((entry) => entry.tree === trees.prompts && entry.originals.has(file))) {
    throw new Error(`${file}: listed as a private still-ask site but missing from hq-private`);
  }
  if (!isPrivate && !held.some((entry) => entry.originals.has(file))) {
    throw new Error(`${file}: listed still-ask site is missing${trees.all.length > 1 ? ' from both hq and hq-private' : ''}`);
  }
}

function renderTrees(trees: Trees, held: Held[], context: RenderContext): Generated[] {
  const generated = collectSites(held, context.data),
    prompts = held.find((entry) => entry.tree === trees.prompts);
  if (prompts) {
    renderSessions(prompts, context, generated);
  }
  for (const session of context.grantsBySession.keys()) {
    if (!context.sessions.has(session)) {
      throw new Error(
        `${trees.prompts.name === null ? '' : `${trees.prompts.name}: `}grants/${session}.yaml: no matching session prompt`,
      );
    }
  }
  return generated;
}

// Without --private, hq is the one tree and holds the grants and the session prompts. With it, the
// grants and session prompts come from the private tree; the still-ask list stays in hq, and each
// listed site is processed in every tree that holds it.
function runMain(): number {
  const args = parseArgs({
    options: { check: { type: 'boolean' }, private: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  return runTrees(buildTrees(args.values.private), args.values.check ?? false);
}

try {
  process.exitCode = runMain();
} catch (error) {
  console.error(`grants: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
