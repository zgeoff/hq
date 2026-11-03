import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dir, '..');

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
  log: boolean;
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

function parseEntries(value: unknown, outcome: 'ask', where: string, today: string): Item[];
function parseEntries(value: unknown, outcome: 'allow', where: string, today: string): Grant[];
function parseEntries(value: unknown, outcome: 'ask' | 'allow', where: string, today: string): (Item | Grant)[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where}: expected a nonempty list`);
  }
  const ids = new Set<string>();
  return value.map((entry, i) => {
    const at = `${where}[${i}]`;
    const fields = outcome === 'ask' ? ['id', 'outcome', 'note', 'note_first'] : ['id', 'label', 'outcome', 'note', 'source', 'until', 'log'];
    const row = parseObject(entry, fields, at);
    const slug = parseText(row.id, `${at}.id`);
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
        if (row.source !== undefined) {
          parseText(row.source, `${at}.source`);
        }
        checkUntil(row.until, { at, id: slug, today, where });
        if (row.log !== undefined && typeof row.log !== 'boolean') {
          throw new Error(`${at}.log: expected true or false`);
        }
        return { id: slug, outcome, note, label: parseText(row.label, `${at}.label`), log: row.log === true };
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

interface UntilContext {
  at: string;
  id: string;
  today: string;
  where: string;
}

function checkUntil(value: unknown, context: UntilContext): void {
  if (value === undefined) {
    return;
  }
  const until = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(until)) {
    throw new Error(`${context.at}.until: expected a date as YYYY-MM-DD`);
  }
  if (context.today > until) {
    throw new Error(`${context.where}: grant ${context.id} ended on ${until} (today is ${context.today}); remove it or set a later until`);
  }
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

function renderDiff(file: string, before: string, after: string): string {
  const newLines = after.split('\n');
  const oldLines = before.split('\n');
  let endNew = newLines.length;
  let endOld = oldLines.length;
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--;
    endNew--;
  }
  {
    const context = Math.min(3, oldLines.length - endOld);
    const from = Math.max(0, start - 3);
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

  also: string[] | undefined;
  dataFile: string;

  privateSites: Set<string>;
  sites: Map<string, Voice>;
  textByVoice: Record<Voice, string>;
}

function buildStillAsk(dataFile: string, entries: unknown[], items: Item[], also: string[] | undefined): StillAsk {
  const afters = new Map<string, string>();
  const getNotes = (voice: Voice) => items.map((item) => (voice === 'first' ? (item.note_first ?? item.note) : item.note));
  const privateSites = new Set<string>();
  const sites = new Map<string, Voice>();
  const textByVoice = { first: formatList(getNotes('first')), third: formatList(getNotes('third')) };
  for (const entry of entries) {
    const row = parseObject(entry, ['file', 'voice', 'after', 'tree'], `${dataFile}.sites`);
    const site = parseText(row.file, 'site.file');
    const voice = site.endsWith('/references/session-prompt.md') ? 'first' : 'third';
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
  const dataFile = 'grants/still-ask.yaml';
  const model = parseObject(Bun.YAML.parse(read(tree, dataFile)), ['items', 'also', 'sites'], dataFile);
  const stillAsk = parseEntries(model.items, 'ask', `${dataFile}.items`, '');
  if (!Array.isArray(model.sites) || model.sites.length === 0) {
    throw new Error(`${dataFile}: expected sites`);
  }
  const also = model.also === undefined ? undefined : parseAlso(model.also, `${dataFile}.also`);
  return buildStillAsk(dataFile, model.sites, stillAsk, also);
}

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

const NEW_FORM = /^You are allowed to:$/mu;
const OLD_FORM = /^Grants:$/mu;
const WORD_CAP = 50;

function normalizeSite(file: string, body: string, data: StillAsk): string {
  const mentions = [...body.matchAll(/security change/gu)].length;
  const spans = [...body.matchAll(/deleting or rewriting\b[^\n]*?\bsecurity change\b/gu)];
  const voice = data.sites.get(file);
  if (voice && mentions === 0 && NEW_FORM.test(body)) {
    return body;
  }
  if (mentions !== spans.length || spans.length !== (voice ? 1 : 0)) {
    throw new Error(
      `${file}: expected ${voice ? 'one still-ask span' : 'no security change outside the listed sites'}; found ${spans.length} spans and ${mentions} security change mentions`,
    );
  }
  let next = body;
  for (const span of spans) {
    const tail = /^[^.)]*[.)]/u.exec(body.slice(span.index + span[0].length))?.[0] ?? '';

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

function renderAlso(file: string, body: string, at: number, also: string[]): string {
  if (!body.startsWith(ALSO_HEAD, at)) {
    return body;
  }
  const start = at + ALSO_HEAD.length;

  const blank = /\n[ \t]*\n/u.exec(body.slice(start));
  const end = blank === null ? body.length - (body.endsWith('\n') ? 1 : 0) : start + blank.index;
  const expected = also.map((item, index) => `- ${item}${index === also.length - 1 ? '.' : ';'}`);
  const found = parseAlsoList(body.slice(start, end));

  if (/^\n(?:[ \t]*\n)+[ \t]*- /u.test(body.slice(end))) {
    throw new Error(`${file}: a "- " line follows the "Also his:" list after a blank line; keep every item in the list`);
  }
  if (found.length === expected.length && found.every((item, index) => item === expected[index])) {
    return body;
  }
  return body.slice(0, start) + expected.map((item) => renderBullet(item.slice(2))).join('\n') + body.slice(end);
}

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
  session: string;
}

function countWords(note: string): number {
  return note.split(/\s+/u).filter(Boolean).length;
}

function renderGrantLines(file: string, context: SessionContext, newForm: boolean): string {
  const fill = (note: string) =>
    note.replaceAll('{still-ask}', () => context.data.textByVoice[context.data.sites.get(file) ?? 'first']);
  if (!newForm) {
    return `Grants:\n${context.grants.map((grant) => `- ${grant.label}: ${fill(grant.note)}`).join('\n')}\n\n`;
  }
  const bullets = context.grants.map((grant) => {
    const words = countWords(grant.note);
    if (words > WORD_CAP) {
      throw new Error(`${file}: grant ${grant.id} note is ${words} words; keep it to ${WORD_CAP} or fewer`);
    }
    const log = grant.log ? ` Log it with \`hq grant act ${context.session}-${grant.id} --target <what you acted on>\`.` : '';
    return `- ${fill(grant.note)}${log}`;
  });
  return `You are allowed to:\n\n${bullets.join('\n')}\n\n`;
}

function renderSessionGrants(file: string, body: string, block: RegExpExecArray, context: SessionContext): string {
  const content = block.groups?.['content'] ?? '';
  const newForm = NEW_FORM.test(content);
  if (newForm && OLD_FORM.test(content)) {
    throw new Error(`${file}: use one of "Grants:" or "You are allowed to:", not both`);
  }
  const pattern = newForm ? /^You are allowed to:\n\n[\s\S]*?\n\n/gmu : /^Grants:\n[\s\S]*?\n\n/gmu;
  const matches = [...content.matchAll(pattern)];
  const [span] = matches;
  if (matches.length !== 1 || !span) {
    throw new Error(`${file}: expected one ${newForm ? 'You are allowed to' : 'Grants'} block ending with a blank line`);
  }
  const rendered = renderGrantLines(file, context, newForm);
  const rest = content.slice(span.index + span[0].length);
  const updatedBlock = block[0].replace(span[0], () => rendered);
  const updatedBody = body.slice(0, block.index) + updatedBlock + body.slice(block.index + block[0].length);

  if (!newForm && /^- /mu.test(rest)) {
    throw new Error(`${file}: a "- " line follows the Grants block after a blank line; keep every grant in the block`);
  }
  return updatedBody;
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
  const blocks = [...body.matchAll(/^```text\n(?<content>[\s\S]*?)^```[ \t]*$/gmu)];
  const session = /The start prompt for `(?<name>z-[a-z0-9-]+)`/u.exec(body)?.groups?.['name'];
  const withGrants = blocks.filter((block) => NEW_FORM.test(block.groups?.['content'] ?? '') || OLD_FORM.test(block.groups?.['content'] ?? ''));
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
    session,
  });
}

function getSessionGrants(file: string, session: string, context: RenderContext): Grant[] {
  const grants = context.grantsBySession.get(session);
  if (!grants) {
    throw new Error(`${file}: no grants/${session}.yaml for this prompt's Grants block`);
  }
  return grants;
}

function readGrants(data: StillAsk, tree: Tree, today: string): Map<string, Grant[]> {
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
    grantsBySession.set(file.slice('grants/'.length, -'.yaml'.length), parseEntries(parsed, 'allow', file, today));
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
  const hq: Tree = { name: 'hq', root };
  const prompts: Tree = { name: 'hq-private', root: resolve(privateDir) };
  if (!existsSync(prompts.root)) {
    throw new Error(`--private ${prompts.root}: no such directory`);
  }
  requirePrivateFiles(prompts);
  return { all: [hq, prompts], hq, prompts };
}

function requirePrivateFiles(tree: Tree): void {
  const grants = collectFiles(tree, 'grants').filter((file) => file.endsWith('.yaml') && file !== 'grants/still-ask.yaml');
  const prompts = [...new Bun.Glob('skills/*/references/session-prompt.md').scanSync({ cwd: tree.root, onlyFiles: true })];
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

function renderSessions(entry: Held, context: RenderContext, generated: Generated[]): void {
  for (const [file, body] of entry.originals) {
    const next = withTree(entry.tree, () => renderSession(file, body, context));
    if (next !== undefined) {
      const existing = generated.find((item) => item.tree === entry.tree && item.file === file);
      const final = withTree(entry.tree, () => normalizeSite(file, next, context.data));
      if (existing) {
        existing.next = final;
      } else {
        generated.push({ file, next: final, original: body, tree: entry.tree });
      }
    }
  }
}

function runTrees(trees: Trees, check: boolean, today: string): number {
  const data = readStillAsk(trees.hq);
  const grantsBySession = withTree(trees.prompts, () => readGrants(data, trees.prompts, today));
  const held = trees.all.map((tree) => readHeld(tree));
  const sessions = new Set<string>();
  for (const file of data.sites.keys()) {
    requireSite(file, trees, held, data);
  }
  return writeGenerated(renderTrees(trees, held, { data, grantsBySession, sessions }), check);
}

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
  const generated = collectSites(held, context.data);
  const prompts = held.find((entry) => entry.tree === trees.prompts);
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

function runMain(): number {
  const args = parseArgs({
    options: { check: { type: 'boolean' }, private: { type: 'string' }, today: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const today = args.values.today ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today)) {
    throw new Error(`--today ${today}: expected YYYY-MM-DD`);
  }
  return runTrees(buildTrees(args.values.private), args.values.check ?? false, today);
}

try {
  process.exitCode = runMain();
} catch (error) {
  console.error(`grants: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
