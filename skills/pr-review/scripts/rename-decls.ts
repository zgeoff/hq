// Reads { path, base, head } entries on stdin and prints the declaration renames, as { old, new }.
// A pair needs a declaration named old at the base and one of the same kind named new at the head,
// with identical text once each name is replaced. Strings and comments hold no declaration.
import { API } from 'typescript/unstable/async';
import type { Project } from 'typescript/unstable/async';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { SyntaxKind } from 'typescript/unstable/ast';
import type { Identifier, Node, SourceFile } from 'typescript/unstable/ast';
import {
  isClassDeclaration,
  isEnumDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
  isVariableDeclaration,
} from 'typescript/unstable/ast/is';
import { z } from 'zod';

type Entry = z.infer<typeof entriesSchema>[number];

interface Named {
  readonly kind: string;
  readonly name: Node | undefined;
}

interface Declaration {
  readonly kind: string;
  readonly name: string;
  readonly shape: string;
}

interface Pair {
  readonly old: string;
  readonly new: string;
}

const EXTENSION = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u,
  KEYWORD = /^(?:await\s+using|const|let|using|var)\b/u,
  PLACEHOLDER = '\u0000name\u0000',
  ROOT = '/rename-decls',
  entriesSchema = z.array(z.object({ path: z.string(), base: z.string().nullable(), head: z.string().nullable() }));

function toNamed(node: Node, keyword: string): Named | undefined {
  if (isClassDeclaration(node)) {
    return { kind: 'class', name: node.name };
  }
  if (isEnumDeclaration(node)) {
    return { kind: 'enum', name: node.name };
  }
  if (isFunctionDeclaration(node)) {
    return { kind: 'function', name: node.name };
  }
  if (isInterfaceDeclaration(node)) {
    return { kind: 'interface', name: node.name };
  }
  if (isTypeAliasDeclaration(node)) {
    return { kind: 'type', name: node.name };
  }
  return isVariableDeclaration(node) ? { kind: `variable ${keyword}`, name: node.name } : undefined;
}

function toIdentifier(node: Node | undefined): Identifier | undefined {
  return node !== undefined && isIdentifier(node) ? node : undefined;
}

function toShape(file: SourceFile, node: Node, kind: string, nameNode: Identifier | undefined): Declaration | undefined {
  if (nameNode === undefined) {
    return undefined;
  }
  const offset = nameNode.end - nameNode.text.length;
  if (offset < node.pos || file.text.slice(offset, nameNode.end) !== nameNode.text) {
    return undefined;
  }
  return {
    kind,
    name: nameNode.text,
    shape: (file.text.slice(node.pos, offset) + PLACEHOLDER + file.text.slice(nameNode.end, node.end)).trim(),
  };
}

function toDeclaration(file: SourceFile, node: Node, keyword: string): Declaration | undefined {
  const named = toNamed(node, keyword);
  return named === undefined ? undefined : toShape(file, node, named.kind, toIdentifier(named.name));
}

function toKeyword(file: SourceFile, list: Node): string {
  const match = KEYWORD.exec(file.text.slice(list.pos, list.end).trimStart());
  return match === null ? 'var' : match[0].replaceAll(/\s+/gu, ' ');
}

function collectFrom(file: SourceFile, node: Node, keyword: string, found: Declaration[]): void {
  const next = node.kind === SyntaxKind.VariableDeclarationList ? toKeyword(file, node) : keyword,
    parsed = toDeclaration(file, node, keyword);
  if (parsed !== undefined) {
    found.push(parsed);
  }
  node.forEachChild((child) => {
    collectFrom(file, child, next, found);
  });
}

function collectDeclarations(file: SourceFile | undefined): Declaration[] {
  const found: Declaration[] = [];
  if (file !== undefined) {
    collectFrom(file, file, 'var', found);
  }
  return found;
}

function collectPairs(base: readonly Declaration[], head: readonly Declaration[]): Pair[] {
  return base.flatMap((before) =>
    head
      .filter((after) => before.kind === after.kind && before.shape === after.shape && before.name !== after.name)
      .map((after) => ({ old: before.name, new: after.name })),
  );
}

function toFileName(side: string, index: number, path: string): string {
  return `${side}${index}${EXTENSION.exec(path)?.[0] ?? '.ts'}`;
}

function buildFiles(entries: readonly Entry[]): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [index, entry] of entries.entries()) {
    if (entry.base !== null && entry.head !== null) {
      files[`${ROOT}/${toFileName('base', index, entry.path)}`] = entry.base;
      files[`${ROOT}/${toFileName('head', index, entry.path)}`] = entry.head;
    }
  }
  return files;
}

async function readFilePairs(project: Project, index: number, path: string): Promise<Pair[]> {
  const base = await project.program.getSourceFile(`${ROOT}/${toFileName('base', index, path)}`),
    head = await project.program.getSourceFile(`${ROOT}/${toFileName('head', index, path)}`);
  return collectPairs(collectDeclarations(base), collectDeclarations(head));
}

async function readOpenPairs(api: API, entries: readonly Entry[]): Promise<Pair[]> {
  const opened = await api.updateSnapshot({ openProject: `${ROOT}/tsconfig.json` }),
    pairs: Pair[] = [],
    project = opened.getProjects().at(0);
  if (project === undefined) {
    throw new Error('the parser opened no project');
  }
  for (const [index, entry] of entries.entries()) {
    if (entry.base !== null && entry.head !== null) {
      pairs.push(...(await readFilePairs(project, index, entry.path)));
    }
  }
  return pairs;
}

async function readPairs(entries: readonly Entry[]): Promise<Pair[]> {
  const files = buildFiles(entries),
    roots = Object.keys(files).map((name) => name.slice(ROOT.length + 1));
  if (roots.length === 0) {
    return [];
  }
  files[`${ROOT}/tsconfig.json`] = JSON.stringify({
    compilerOptions: { allowJs: true, jsx: 'preserve', noLib: true, noResolve: true, types: [] },
    files: roots,
  });
  return await readWithFiles(files, entries);
}

async function readWithFiles(files: Record<string, string>, entries: readonly Entry[]): Promise<Pair[]> {
  const api = new API({ fs: createVirtualFileSystem(files) });
  try {
    return await readOpenPairs(api, entries);
  } finally {
    await api.close();
  }
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error('rename-decls expects JSON on stdin', { cause: error });
  }
}

async function readEntries(): Promise<Entry[]> {
  const input = await Bun.stdin.text(),
    parsed = entriesSchema.safeParse(parseJson(input));
  if (!parsed.success) {
    throw new Error(`rename-decls expects a JSON list of { path, base, head } on stdin: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function runRenameDecls(): Promise<void> {
  const entries = await readEntries(),
    pairs = await readPairs(entries.filter((entry) => EXTENSION.test(entry.path))),
    unique = new Map(pairs.map((pair) => [`${pair.old}\u0000${pair.new}`, pair]));
  process.stdout.write(`${JSON.stringify([...unique.values()])}\n`);
}

await runRenameDecls();
