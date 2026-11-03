import { expect, onTestFinished, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseGrantEntries } from '../src/grants/read-main-grants.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-grants-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  {
    const repo = resolve(import.meta.dir, '..');
    cpSync(join(repo, 'scripts/grants.ts'), join(dir, 'scripts/grants.ts'));
    const fixture = join(repo, 'scripts/fixtures/grants');
    const run = (args: string[] = ['--check']) =>
      Bun.spawnSync([process.execPath, join(dir, 'scripts/grants.ts'), ...args], {
        cwd: dir,
        stdout: 'pipe',
        stderr: 'pipe',
      });
    const useNewForm = () => {
      for (const path of ['grants', 'skills', 'docs']) {
        cpSync(join(fixture, path), join(dir, path), { recursive: true });
      }
      cpSync(join(fixture, 'new-form'), dir, { recursive: true });
      const stillAsk = join(dir, 'grants/still-ask.yaml');
      writeFileSync(
        stillAsk,
        `${readFileSync(stillAsk, 'utf8')}  - file: skills/lantern/references/session-prompt.md\n    voice: first\n    after: "."\n`,
      );
      const promptPath = join(dir, 'skills/lantern/references/session-prompt.md');
      const grantsPath = join(dir, 'grants/z-lantern.yaml');
      const written = run([]);
      if (written.exitCode !== 0) {
        throw new Error(written.stderr.toString());
      }
      return {
        grantsPath,
        promptPath,
        run,
        readPrompt: () => readFileSync(promptPath, 'utf8'),
        editGrants: (edit: (text: string) => string) => writeFileSync(grantsPath, edit(readFileSync(grantsPath, 'utf8'))),
      };
    };
    return {
      dir,

      fixture,
      run,
      useNewForm,
    };
  }
}

test('it matches the committed generated files', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const result = ctx.run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe('grants: 11 files match\n');
    expect(result.stderr.toString()).toBe('');
  }
});

test('it repairs a hand edit to a generated grant and leaves check mode read-only', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const file = 'skills/preview-qa/references/session-prompt.md';
    const path = join(ctx.dir, file);
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('- read zgeoff PRs and their comments.');
    writeFileSync(path, source.replace('- read zgeoff PRs and their comments.', '- read every repo.'));
    {
      const checked = ctx.run();
      const checkedSource = readFileSync(path, 'utf8');
      const written = ctx.run([]);
      const writtenSource = readFileSync(path, 'utf8');
      expect(checked.exitCode).toBe(1);
      expect(checked.stdout.toString()).toContain(`--- a/${file}\n+++ b/${file}\n@@ `);
      expect(checked.stdout.toString()).toContain('-- read every repo.');
      expect(checked.stdout.toString()).toContain('+- read zgeoff PRs and their comments.');
      expect(checkedSource).toContain('- read every repo.');
      expect(written.exitCode).toBe(0);
      expect(writtenSource).toBe(source);
      expect(ctx.run().exitCode).toBe(0);
    }
  }
});

test('it restores a legacy still-ask list from the placeholder in a grant note', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/definitions-stewardship/references/session-prompt.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain("my data, anything that touches Nix's memory");
    writeFileSync(path, source.replace("my data, anything that touches Nix's memory", "my data, Nix's memory"));
    {
      const checked = ctx.run();
      const written = ctx.run([]);
      expect(checked.exitCode).toBe(1);
      expect(written.exitCode).toBe(0);
      expect(readFileSync(path, 'utf8')).toBe(source);
      expect(ctx.run().exitCode).toBe(0);
    }
  }
});

test('it rejects an unlisted security change mention', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  writeFileSync(join(ctx.dir, 'docs/extra.md'), 'Ask for a security change.\n');
  {
    const result = ctx.run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('docs/extra.md: expected no security change outside the listed sites');
  }
});

test('it rejects a listed site with an extra span before grant replacement', () => {
  const replacement = 'deleting or rewriting my data, or a security change. deleting or rewriting my data, or a security change';
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/session-prompt.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(/deleting or rewriting[^\n]*?security change/u);
    writeFileSync(path, source.replace(/deleting or rewriting[^\n]*?security change/u, replacement));
    {
      const result = ctx.run();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('expected one still-ask span');
    }
  }
});

test('it reports a diff for a hand edit inside a still-ask list', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/linear-triage/SKILL.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('credentials, scope and naming');
    writeFileSync(path, source.replace('credentials, scope and naming', 'credentials, another item, scope and naming'));
    {
      const result = ctx.run();
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain('--- a/skills/linear-triage/SKILL.md');
      expect(result.stdout.toString()).toContain('another item');
    }
  }
});

test('it rejects a grant file whose prompt has no allowed block', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/preview-qa/references/session-prompt.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('\nYou are allowed to:\n');
    writeFileSync(path, source.replace('\nYou are allowed to:\n', '\nAllowed:\n'));
    {
      const result = ctx.run();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe('grants: grants/z-qa.yaml: no matching session prompt\n');
    }
  }
});

test('it refuses a prompt with no grant file, in both modes, before any write', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  rmSync(join(ctx.dir, 'grants/z-qa.yaml'));
  {
    const path = join(ctx.dir, 'skills/preview-qa/references/session-prompt.md');
    const source = readFileSync(path, 'utf8');
    {
      const checked = ctx.run();
      const message = 'grants: skills/preview-qa/references/session-prompt.md: no grants/z-qa.yaml for this prompt\'s Grants block\n';
      const written = ctx.run([]);
      expect(checked.exitCode).toBe(1);
      expect(checked.stderr.toString()).toBe(message);
      expect(written.exitCode).toBe(1);
      expect(written.stderr.toString()).toBe(message);
      expect(readFileSync(path, 'utf8')).toBe(source);
    }
  }
});

test('it carries a first-person wording change without the words "my data"', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'grants/still-ask.yaml');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('note_first: "deleting or rewriting my data"');
    writeFileSync(
      path,
      source.replace('note_first: "deleting or rewriting my data"', 'note_first: "deleting or rewriting my personal records"'),
    );
    {
      const written = ctx.run([]);
      expect(written.exitCode).toBe(0);
      expect(ctx.run().exitCode).toBe(0);
      expect(readFileSync(join(ctx.dir, 'skills/intake/references/session-prompt.md'), 'utf8')).toContain(
        'unless it involves deleting or rewriting my personal records, ',
      );
    }
  }
});

test('it rejects a match field in grant data', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'grants/z-qa.yaml');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('  outcome: allow');
    writeFileSync(path, source.replace('  outcome: allow', '  outcome: allow\n  tools: ["*"]'));
    {
      const result = ctx.run();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('unexpected field tools');
    }
  }
});

test('it updates all seven still-ask sites, including both Grants blocks, from the source list', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'grants/still-ask.yaml');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('note: "a priority"');
    writeFileSync(path, source.replace('note: "a priority"', 'note: "a changed priority"'));
    {
      const checked = ctx.run();
      const written = ctx.run([]);
      expect(checked.exitCode).toBe(1);
      expect(checked.stdout.toString().match(/^--- a\//gmu)).toHaveLength(7);
      expect(written.exitCode).toBe(0);
      expect(ctx.run().exitCode).toBe(0);
      expect(readFileSync(join(ctx.dir, 'skills/intake/references/session-prompt.md'), 'utf8')).toContain(', a changed priority, and ');
      expect(readFileSync(join(ctx.dir, 'skills/definitions-stewardship/references/session-prompt.md'), 'utf8')).toContain(
        ', a changed priority, and ',
      );
    }
  }
});

test('it rejects a still-ask list that no longer ends with "security change"', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'grants/still-ask.yaml');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('a High or Urgent security change"');
    writeFileSync(path, source.replace('a High or Urgent security change"', 'a High or Urgent security change that affects production"'));
    {
      const result = ctx.run([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('end with "security change"');
    }
  }
});

test.each([
  ['check', ['--check']],
  ['write', []],
])('it rejects a grant bullet after a blank line in %s mode', (_label, args) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/delivery-lead/references/session-prompt.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('\n- publish a kite release');
    writeFileSync(path, source.replace('\n- publish a kite release', '\n\n- publish a kite release'));
    {
      const result = ctx.run(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('expected one You are allowed to block ending with a blank line');
    }
  }
});

test('it generates an invented fleet and passes the next check', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'docs', 'skills/garden/references']) {
    mkdirSync(join(ctx.dir, path), { recursive: true });
  }
  writeFileSync(
    join(ctx.dir, 'grants/still-ask.yaml'),
    [
      'items:',
      '  - id: data',
      '    outcome: ask',
      '    note: "deleting or rewriting the owner\'s data"',
      '    note_first: "deleting or rewriting my data"',
      '  - id: security',
      '    outcome: ask',
      '    note: "a High security change"',
      'sites:',
      '  - file: skills/garden/references/session-prompt.md',
      '    voice: first',
      '    after: "."',
      '',
    ].join('\n'),
  );
  writeFileSync(join(ctx.dir, 'docs/readme.md'), '# docs\n');
  writeFileSync(
    join(ctx.dir, 'grants/z-garden.yaml'),
    ['- id: water', '  label: "Water"', '  outcome: allow', '  note: "water the paper orchard each morning."', ''].join('\n'),
  );
  writeFileSync(
    join(ctx.dir, 'skills/garden/references/session-prompt.md'),
    [
      '# session prompt',
      '',
      'The start prompt for `z-garden`.',
      '',
      '```text',
      'You are z-garden.',
      '',
      'You are allowed to:',
      '',
      '- stale text.',
      '',
      'Ask me first about deleting or rewriting my data, or a security change.',
      '```',
      '',
    ].join('\n'),
  );
  {
    const checked = ctx.run();
    const written = ctx.run([]);
    {
      const prompt = readFileSync(join(ctx.dir, 'skills/garden/references/session-prompt.md'), 'utf8');
      const rechecked = ctx.run();
      expect(checked.exitCode).toBe(1);
      expect(written.exitCode).toBe(0);
      expect(prompt).toContain('- water the paper orchard each morning.\n');
      expect(prompt).toContain('Ask me first about deleting or rewriting my data, and a High security change.');
      expect(rechecked.exitCode).toBe(0);
      expect(rechecked.stdout.toString()).toBe('grants: 1 files match\n');
      expect(rechecked.stderr.toString()).toBe('');
    }
  }
});

test.each([
  ['check', ['--check']],
  ['write', []],
])('it rejects a qualifier after the last still-ask item in %s mode', (_label, args) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/delivery-lead/references/releases.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('security change.');
    writeFileSync(path, source.replace('security change.', 'security change that deletes production data.'));
    {
      const result = ctx.run(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('as grants/still-ask.yaml pins');
    }
  }
});

test.each([
  ['unknown flag', ['--chek'], "Unknown option '--chek'"],
  ['positional argument', ['check'], 'Unexpected argument'],
])('it rejects an %s before it can write files', (_label, args, message) => {
  const ctx = setupTest();
  const result = ctx.run(args);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain(message);
  expect(result.stdout.toString()).toBe('');
});

test.each([
  ['check', ['--check']],
  ['write', []],
])('it rejects outcome ask in a session grant in %s mode', (_label, args) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  writeFileSync(join(ctx.dir, 'grants/z-qa.yaml'), '- id: github\n  label: GitHub\n  outcome: ask\n  note: read PRs.\n');
  {
    const result = ctx.run(args);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('grants/z-qa.yaml[0]: outcome must be allow');
    expect(result.stdout.toString()).toBe('');
  }
});

test.each([
  ['check', ['--check']],
  ['write', []],
])('it rejects a literal still-ask list in a grant note in %s mode', (_label, args) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'grants/z-stu.yaml');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('{still-ask}');
    writeFileSync(path, source.replace('{still-ask}', 'deleting or rewriting my data, or a security change'));
    {
      const result = ctx.run(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('grants/z-stu.yaml[3].note: use {still-ask}');
      expect(result.stdout.toString()).toBe('');
    }
  }
});

test.each([
  ['third', 'note: "a security change to a personal account"\n    note_first: "a personal account"', 'security change', 'end'],
  ['first', 'note: "a personal account"\n    note_first: "a security change to a personal account"', 'security change', 'end'],
  ['third', 'note: "deleting or rewriting a personal account"\n    note_first: "a personal account"', 'deleting or rewriting', 'start'],
  ['first', 'note: "a personal account"\n    note_first: "deleting or rewriting a personal account"', 'deleting or rewriting', 'start'],
])('it rejects an extra boundary phrase in the %s voice (%s) before any write', (voice, note, phrase, boundary) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const generated = [...new Bun.Glob('**/*').scanSync({ cwd: ctx.dir, onlyFiles: true })].filter((file) =>
        /^(?:skills|docs)\//u.test(file),
      );
    const originals = generated.map((file) => readFileSync(join(ctx.dir, file)));
    const path = join(ctx.dir, 'grants/still-ask.yaml');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('  - id: priority\n');
    writeFileSync(
      path,
      source.replace('  - id: priority\n', `  - id: personal-account\n    outcome: ask\n    ${note}\n  - id: priority\n`),
    );
    {
      const result = ctx.run([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(`the ${voice}-voice still-ask list must contain`);
      expect(result.stderr.toString()).toContain(`"${phrase}" only at its ${boundary}`);
      expect(result.stdout.toString()).toBe('');
      expect(generated.map((file) => readFileSync(join(ctx.dir, file)))).toStrictEqual(originals);
    }
  }
});

const PRIVATE_DOCS = ['delivery-design', 'evaluation', 'refusals', 'roles-design'].map(
    (doc) => `docs/skill-development/${doc}.md`,
  );

function setupPrivateTest(shared = false) {
  const ctx = setupTest();
  {
    const grantFiles = [...new Bun.Glob('*.yaml').scanSync({ cwd: join(ctx.fixture, 'grants') })].filter(
      (file) => file !== 'still-ask.yaml',
    );
    const privateDir = join(ctx.dir, 'private');
    const privatePrompts = [
      'definitions-stewardship',
      'delivery-lead',
      'intake',
      'linear-triage',
      'pr-review',
      'preview-qa',
    ].map((skill) => `skills/${skill}/references/session-prompt.md`);
    for (const path of ['grants', 'skills', 'docs']) {
      cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
    }
    cpSync(join(ctx.fixture, 'fleet.json'), join(ctx.dir, 'fleet.json'));
    for (const file of [...grantFiles.map((name) => `grants/${name}`), ...privatePrompts, ...PRIVATE_DOCS]) {
      mkdirSync(dirname(join(privateDir, file)), { recursive: true });
      cpSync(join(ctx.dir, file), join(privateDir, file));
      if (!shared) {
        rmSync(join(ctx.dir, file));
      }
    }
    return {
      ...ctx,
      privateDir,
      runPrivate: (extra: string[] = ['--check']) => ctx.run([...extra, '--private', privateDir]),
    };
  }
}

test('with --private it passes on matching files in both trees', () => {
  const result = setupPrivateTest().runPrivate();
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('grants: 11 files match\n');
});

test('with --private it still passes while hq holds the same copies', () => {
  const result = setupPrivateTest(true).runPrivate();
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
});

test('with --private it fails on a drifted private prompt, names the tree, and writes the repair without --check', () => {
  const ctx = setupPrivateTest();
  {
    const file = 'skills/preview-qa/references/session-prompt.md';
    const path = join(ctx.privateDir, file);
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace('- read zgeoff PRs and their comments.', '- read every repo.'));
    {
      const checked = ctx.runPrivate();
      expect(checked.exitCode).toBe(1);
      expect(checked.stdout.toString()).toContain(`--- a/hq-private:${file}`);
      expect(checked.stdout.toString()).toContain('+- read zgeoff PRs and their comments.');
      expect(readFileSync(path, 'utf8')).toContain('- read every repo.');
    }
    expect(ctx.runPrivate([]).exitCode).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(source);
    expect(ctx.runPrivate().exitCode).toBe(0);
  }
});

test('with --private it repairs a still-ask list in a private doc from the list in hq', () => {
  const ctx = setupPrivateTest();
  {
    const path = join(ctx.privateDir, 'docs/skill-development/roles-design.md');
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace("Nix's memory or identity", 'Nix'));
    expect(ctx.runPrivate().exitCode).toBe(1);
    expect(ctx.runPrivate([]).exitCode).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(source);
  }
});

test('with --private it reads the grants from the private dir', () => {
  const ctx = setupPrivateTest();
  {
    const path = join(ctx.privateDir, 'grants/z-qa.yaml');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('read zgeoff PRs and their comments.', 'read the invented repo.'),
    );
  }
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain('+- read the invented repo.');
  }
});

test('with --private an error names the tree that holds the file', () => {
  const ctx = setupPrivateTest();
  writeFileSync(join(ctx.privateDir, 'docs/extra.md'), 'Ask for a security change.\n');
  expect(ctx.runPrivate().stderr.toString()).toContain(
    'grants: hq-private: docs/extra.md: expected no security change',
  );
  rmSync(join(ctx.privateDir, 'docs/extra.md'));
  writeFileSync(join(ctx.dir, 'docs/extra.md'), 'Ask for a security change.\n');
  expect(ctx.runPrivate().stderr.toString()).toContain('grants: hq: docs/extra.md: expected no security change');
});

test('with --private a listed site that neither tree holds is an error', () => {
  const ctx = setupPrivateTest();
  rmSync(join(ctx.privateDir, 'docs/skill-development/roles-design.md'));
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(
      'docs/skill-development/roles-design.md: listed still-ask site is missing from both',
    );
  }
});

test('with --private a grant file in hq is ignored', () => {
  const ctx = setupPrivateTest();
  writeFileSync(join(ctx.dir, 'grants/z-nobody.yaml'), 'not read\n');
  expect(ctx.runPrivate().exitCode).toBe(0);
});

test('with --private a grant file without a private prompt is refused', () => {
  const ctx = setupPrivateTest();
  cpSync(join(ctx.privateDir, 'grants/z-qa.yaml'), join(ctx.privateDir, 'grants/z-extra.yaml'));
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe('grants: hq-private: grants/z-extra.yaml: no matching session prompt\n');
  }
});

test('with --private a still-ask list in the private dir is refused', () => {
  const ctx = setupPrivateTest();
  cpSync(join(ctx.dir, 'grants/still-ask.yaml'), join(ctx.privateDir, 'grants/still-ask.yaml'));
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('hq-private: grants/still-ask.yaml: the still-ask list stays in hq');
  }
});

test('with --private a missing directory is refused', () => {
  const ctx = setupPrivateTest();
  {
    const result = ctx.run(['--check', '--private', join(ctx.dir, 'nowhere')]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('no such directory');
  }
});

test('with --private an empty private dir is refused, though hq still holds every listed site', () => {
  const ctx = setupPrivateTest(true);
  const empty = join(ctx.dir, 'empty');
  mkdirSync(empty);
  {
    const result = ctx.run(['--check', '--private', empty]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe(
      `grants: --private ${empty}: holds no grants (grants/<session>.yaml) and no session prompts (skills/*/references/session-prompt.md); is it the hq-private checkout?\n`,
    );
    expect(result.stdout.toString()).toBe('');
  }
});

test('with --private a private dir without grants is refused', () => {
  const ctx = setupPrivateTest(true);
  rmSync(join(ctx.privateDir, 'grants'), { recursive: true });
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe(
      `grants: --private ${ctx.privateDir}: holds no grants (grants/<session>.yaml); is it the hq-private checkout?\n`,
    );
  }
});

test('with --private a private dir without session prompts is refused', () => {
  const ctx = setupPrivateTest(true);
  rmSync(join(ctx.privateDir, 'skills'), { recursive: true });
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe(
      `grants: --private ${ctx.privateDir}: holds no session prompts (skills/*/references/session-prompt.md); is it the hq-private checkout?\n`,
    );
  }
});

test('without --private the errors are as they were', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  writeFileSync(join(ctx.dir, 'docs/extra.md'), 'Ask for a security change.\n');
  expect(ctx.run().stderr.toString()).toBe(
    'grants: docs/extra.md: expected no security change outside the listed sites; found 0 spans and 1 security change mentions\n',
  );
});

function writePrivateSites(dir: string, value = 'private'): void {
  const file = join(dir, 'grants/still-ask.yaml');
  let text = readFileSync(file, 'utf8');
  const privateSites = [
    'skills/intake/references/session-prompt.md',
    'skills/definitions-stewardship/references/session-prompt.md',
    'docs/skill-development/roles-design.md',
  ];
  for (const site of privateSites) {
    text = text.replace(`  - file: ${site}\n`, `  - file: ${site}\n    tree: ${value}\n`);
  }
  writeFileSync(file, text);
}

test('without --private it checks only the public sites once hq drops the private files', () => {
  const ctx = setupPrivateTest();
  writePrivateSites(ctx.dir);
  {
    const result = ctx.run();
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe('grants: 4 files match\n');
  }
});

test('without --private an unmarked site hq no longer holds is still an error', () => {
  const result = setupPrivateTest().run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('grants: skills/intake/references/session-prompt.md: listed still-ask site is missing\n');
});

test('with --private the private sites are checked in the private dir', () => {
  const ctx = setupPrivateTest();
  writePrivateSites(ctx.dir);
  {
    const result = ctx.runPrivate();
    expect(result.stderr.toString()).toBe('');
    expect(result.stdout.toString()).toBe('grants: 11 files match\n');
  }
});

test('with --private a private site missing from the private dir is an error, though hq holds it', () => {
  const ctx = setupPrivateTest(true);
  writePrivateSites(ctx.dir);
  rmSync(join(ctx.privateDir, 'docs/skill-development/roles-design.md'));
  {
    const result = ctx.runPrivate();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe('grants: docs/skill-development/roles-design.md: listed as a private still-ask site but missing from hq-private\n');
  }
});

test('it rejects a site tree other than private', () => {
  const ctx = setupTest();
  cpSync(join(ctx.fixture, 'grants'), join(ctx.dir, 'grants'), { recursive: true });
  writePrivateSites(ctx.dir, 'public');
  {
    const result = ctx.run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toBe('grants: skills/intake/references/session-prompt.md: tree must be private, or left out for a site hq holds\n');
  }
});

test('it passes an "Also his:" list that matches once its wrapped lines are joined', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/calls.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('Glass that cracks,\n  Oil, Wicks');
    writeFileSync(path, source.replace('Glass that cracks,\n  Oil, Wicks', 'Glass\n  that cracks, Oil, Wicks'));
    {
      const result = ctx.run();
      expect(result.stdout.toString()).toBe('grants: 11 files match\n');
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(0);
    }
  }
});

test.each([
  ['a missing item', '- a new greenhouse;\n', '', ['+- a new greenhouse;']],
  ['an extra item', '- a new greenhouse;\n', '- a new greenhouse;\n- a moonlit picnic;\n', ['-- a moonlit picnic;']],
  [
    'a reordered list',
    '- pruning the paper orchard;\n- a new greenhouse;\n',
    '- a new greenhouse;\n- pruning the paper orchard;\n',
    ['-- a new greenhouse;', '+- pruning the paper orchard;'],
  ],
  ['a line that is not a bullet', '- a new greenhouse;\n', '* a new greenhouse;\n', ['-* a new greenhouse;', '+- a new greenhouse;']],
  ['an item with no bullet', '- a new greenhouse;\n', 'a new greenhouse;\n', ['-a new greenhouse;', '+- a new greenhouse;']],
  ['a wrong last-item punctuation', '- renaming the river.', '- renaming the river;', ['-- renaming the river;', '+- renaming the river.']],
])('it reports %s in an "Also his:" list and a write run regenerates it', (_label, from, to, lines) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const file = 'skills/intake/references/calls.md';
    const path = join(ctx.dir, file);
    const source = readFileSync(path, 'utf8');
    expect(source).toContain(from);
    writeFileSync(path, source.replace(from, to));
    {
      const checked = ctx.run();
      const written = ctx.run([]);
      expect(checked.exitCode).toBe(1);
      expect(checked.stdout.toString()).toContain(`--- a/${file}\n+++ b/${file}\n@@ `);
      expect(lines.filter((line) => !checked.stdout.toString().includes(`\n${line}\n`))).toStrictEqual([]);
      expect(checked.stderr.toString()).toBe('');
      expect(written.exitCode).toBe(0);
      expect(written.stdout.toString()).toBe('grants: wrote 1 files (11 generated files)\n');
      expect(readFileSync(path, 'utf8')).toBe(source);
      expect(ctx.run().exitCode).toBe(0);
    }
  }
});

test('it ends an "Also his:" list at a line of spaces, so a write run keeps the paragraph after it', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/calls.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('- renaming the river.\n\nAnything else');
    writeFileSync(path, source.replace('- renaming the river.\n\n', '- renaming the river;\n  \n'));
    {
      const written = ctx.run([]);
      expect(written.exitCode).toBe(0);
      expect(readFileSync(path, 'utf8')).toBe(source.replace('- renaming the river.\n\n', '- renaming the river.\n  \n'));
    }
  }
});

test('it leaves a site with no "Also his:" line unchecked for the list', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/calls.md');
    const source = readFileSync(path, 'utf8');
    const start = source.indexOf('\n\nAlso his:');
    const end = source.indexOf('\n\nAnything else');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    writeFileSync(path, source.slice(0, start) + source.slice(end));
    {
      const stripped = readFileSync(path, 'utf8');
      const checked = ctx.run();
      const written = ctx.run([]);
      expect(checked.stdout.toString()).toBe('grants: 11 files match\n');
      expect(checked.exitCode).toBe(0);
      expect(written.stdout.toString()).toBe('grants: wrote 0 files (11 generated files)\n');
      expect(readFileSync(path, 'utf8')).toBe(stripped);
    }
  }
});

test.each([
  ['check', ['--check'], '\n\n'],
  ['write', [], '\n\n'],
  ['check', ['--check'], '\n  \n'],
])('it rejects a bullet after a blank line below the "Also his:" list in %s mode (%j)', (_label, args, gap) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/calls.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('- renaming the river.\n\n');
    writeFileSync(path, source.replace('- renaming the river.\n\n', `- renaming the river.\n${gap}- a moonlit picnic.\n\n`));
    {
      const edited = readFileSync(path, 'utf8');
      const result = ctx.run(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe(
        'grants: skills/intake/references/calls.md: a "- " line follows the "Also his:" list after a blank line; keep every item in the list\n',
      );
      expect(result.stdout.toString()).toBe('');
      expect(readFileSync(path, 'utf8')).toBe(edited);
    }
  }
});

test.each([
  ['an empty list', 'also: []\n', 'grants: grants/still-ask.yaml.also: expected a nonempty list\n'],
  [
    'a duplicate item',
    'also:\n  - "a new greenhouse"\n  - "a new greenhouse"\n',
    'grants: grants/still-ask.yaml.also[1]: duplicate item "a new greenhouse"\n',
  ],
  ['an empty item', 'also:\n  - ""\n', 'grants: grants/still-ask.yaml.also[0]: expected one nonempty line\n'],
  [
    'an item with its closing punctuation',
    'also:\n  - "a new greenhouse;"\n',
    'grants: grants/still-ask.yaml.also[0]: give the item without its "- " bullet, closing ";" or ".", or surrounding spaces\n',
  ],
])('it rejects %s in the also list', (_label, also, message) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'grants/still-ask.yaml');
    const source = readFileSync(path, 'utf8');
    const start = source.indexOf('also:\n');
    const end = source.indexOf('sites:\n');
    expect(start).toBeGreaterThan(0);
    writeFileSync(path, source.slice(0, start) + also + source.slice(end));
    {
      const result = ctx.run();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe(message);
      expect(result.stdout.toString()).toBe('');
    }
  }
});

test('it renders the new form as one bullet per grant, with the log sentence only for a logged grant', () => {
  const ctx = setupTest().useNewForm();
  expect(ctx.readPrompt()).toContain(
    [
      'You are allowed to:',
      '',
      '- Light the harbour lamps at dusk and put them out at dawn.',
      '- Refill a lamp from the shed barrel when it runs low. Log it with `hq grant act z-lantern-oil --target <what you acted on>`.',
      "- Row out to a stuck buoy and free it, and ask the keeper first about deleting or rewriting my data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change.",
      '',
      'You never:',
      '',
      '- Move a lamp from its post.',
      '',
    ].join('\n'),
  );
  expect(ctx.run().exitCode).toBe(0);
});

test('it fills an empty new-form list without consuming the limits list after it', () => {
  const ctx = setupTest().useNewForm();
  const prompt = ctx.readPrompt();
  const start = prompt.indexOf('You are allowed to:\n\n');
  const end = prompt.indexOf('You never:');
  writeFileSync(ctx.promptPath, `${prompt.slice(0, start)}You are allowed to:\n\n${prompt.slice(end)}`);
  expect(ctx.readPrompt()).toContain('You are allowed to:\n\nYou never:\n\n- Move a lamp from its post.\n\n');
  expect(ctx.run([]).exitCode).toBe(0);
  expect(ctx.readPrompt()).toContain(
    [
      '- Light the harbour lamps at dusk and put them out at dawn.',
      '- Refill a lamp from the shed barrel when it runs low. Log it with `hq grant act z-lantern-oil --target <what you acted on>`.',
      "- Row out to a stuck buoy and free it, and ask the keeper first about deleting or rewriting my data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change.",
      '',
      'You never:',
      '',
      '- Move a lamp from its post.',
      '',
    ].join('\n'),
  );
});

test('it refuses a new-form list with no blank line after it', () => {
  const ctx = setupTest().useNewForm();
  const prompt = ctx.readPrompt();
  writeFileSync(ctx.promptPath, `${prompt.slice(0, prompt.indexOf('\n\nYou never:'))}\n\`\`\`\n`);
  const result = ctx.run([]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('expected one You are allowed to block ending with a blank line');
});

test('it reads a grants file with source, until and log in both grants.ts and the main-grants reader', () => {
  const ctx = setupTest().useNewForm();
  expect(ctx.run(['--check']).exitCode).toBe(0);
  expect(ctx.readPrompt()).toContain('Log it with `hq grant act z-lantern-oil --target <what you acted on>`.');
  expect(ctx.readPrompt()).not.toContain('Log it with `hq grant act z-lantern-light');
  expect(ctx.run(['--check', '--today', '2099-01-02']).exitCode).toBe(1);
  expect(parseGrantEntries(readFileSync(ctx.grantsPath, 'utf8'))?.map((grant) => [grant.id, grant.label])).toStrictEqual([
    ['light', 'Light'],
    ['oil', 'Oil'],
    ['sail', 'Sail'],
  ]);
});

test('it refuses {still-ask} in a grant note of a file that is not a still-ask site', () => {
  const ctx = setupTest().useNewForm();
  const stillAsk = join(dirname(ctx.grantsPath), 'still-ask.yaml');
  writeFileSync(stillAsk, readFileSync(stillAsk, 'utf8').replace(/  - file: skills\/lantern\/references\/session-prompt\.md\n    voice: first\n    after: "\."\n/u, ''));
  const prompt = ctx.readPrompt();
  writeFileSync(ctx.promptPath, `${prompt.slice(0, prompt.indexOf('You are allowed to:'))}You are allowed to:\n\n- stale text\n\n${prompt.slice(prompt.indexOf('You never:'))}`);
  const result = ctx.run([]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('grant sail uses {still-ask}, but the file is not a still-ask site; point the note at the owner-calls skill instead');
});

test('it never renders a grant source', () => {
  const ctx = setupTest().useNewForm();
  expect(ctx.readPrompt()).not.toContain('The keeper, 2026-03-02');
  expect(ctx.readPrompt()).not.toContain('source');
});

test('it refuses a Grants: prompt and tells the author to use You are allowed to:', () => {
  const ctx = setupTest().useNewForm();
  writeFileSync(ctx.promptPath, ctx.readPrompt().replace('You are allowed to:\n\n', 'Grants:\n'));
  const result = ctx.run([]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe(
    'grants: skills/lantern/references/session-prompt.md: the "Grants:" form is gone; use "You are allowed to:" instead\n',
  );
});

test.each([
  ['in the future', '2026-11-03', 0],
  ['on the day', '2099-01-01', 0],
  ['in the past', '2099-01-02', 1],
])('it handles a grant with an until date %s: today %s exits %i', (_label, today, code) => {
  const ctx = setupTest().useNewForm();
  const result = ctx.run(['--today', today]);
  expect(result.exitCode).toBe(code);
  if (code === 1) {
    expect(result.stderr.toString()).toContain('grants/z-lantern.yaml: grant sail ended on 2099-01-01 (today is 2099-01-02)');
  }
});

test.each([
  ['in the past', '2099-01-02', 1],
  ['on the day', '2099-01-01', 0],
  ['in the future', '2026-11-03', 0],
])('it handles an until date in check mode %s: today %s exits %i', (_label, today, code) => {
  const ctx = setupTest().useNewForm();
  const result = ctx.run(['--check', '--today', today]);
  expect(result.exitCode).toBe(code);
  if (code === 1) {
    expect(result.stderr.toString()).toContain('grant sail ended on 2099-01-01 (today is 2099-01-02)');
  }
});

test.each([
  ['an impossible month', '2026-99-99'],
  ['an impossible day', '2026-02-30'],
  ['a malformed date', 'tomorrow'],
])('it refuses %s for --today', (_label, today) => {
  const ctx = setupTest().useNewForm();
  const result = ctx.run(['--today', today]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('expected YYYY-MM-DD');
});

test.each([
  ['an impossible date', '2026-99-99'],
  ['a malformed date', 'soon'],
])('it refuses %s for until', (_label, until) => {
  const ctx = setupTest().useNewForm();
  ctx.editGrants((text) => text.replace('2099-01-01', until));
  const result = ctx.run(['--check']);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('until: expected a date as YYYY-MM-DD');
});

test('it keeps the still-ask span required when the new-form header sits outside the text block', () => {
  const ctx = setupTest().useNewForm();
  ctx.editGrants((text) => text.replace('ask the keeper first about {still-ask}', 'ask the keeper first'));
  const outside = ctx.readPrompt().replace(/You are allowed to:\n\n(?:- [^\n]*\n)+/u, 'Allowed:\n\n- none\n').replace('\nYou never:\n\n- Move a lamp from its post.\n', '');
  writeFileSync(ctx.promptPath, `${outside}\nYou are allowed to:\n`);
  rmSync(ctx.grantsPath);
  const result = ctx.run(['--check']);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('expected one still-ask span');
});

test('it refuses an expired grant in write mode, before it writes', () => {
  const ctx = setupTest().useNewForm();
  const before = ctx.readPrompt();
  const result = ctx.run(['--today', '2100-01-01']);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('grant sail ended');
  expect(ctx.readPrompt()).toBe(before);
});

test('it fails a note over 50 words with the file, the id and the count', () => {
  const ctx = setupTest().useNewForm();
  const words = Array.from({ length: 51 }, () => 'lamp').join(' ');
  ctx.editGrants((text) => text.replace('Refill a lamp from the shed barrel when it runs low.', `${words}.`));
  const result = ctx.run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('skills/lantern/references/session-prompt.md: grant oil note is 51 words; keep it to 50 or fewer');
});

test('it passes a note of exactly 50 words', () => {
  const ctx = setupTest().useNewForm();
  const words = Array.from({ length: 50 }, () => 'lamp').join(' ');
  ctx.editGrants((text) => text.replace('Refill a lamp from the shed barrel when it runs low.', `${words}.`));
  expect(ctx.run([]).exitCode).toBe(0);
});

test('it passes a still-ask site with no span', () => {
  const ctx = setupTest().useNewForm();
  ctx.editGrants((text) => text.replace('ask the keeper first about {still-ask}', 'ask the keeper first'));
  expect(ctx.run([]).stderr.toString()).toBe('');
  expect(ctx.run().exitCode).toBe(0);
});

test('it still fails an unknown grant field', () => {
  const ctx = setupTest().useNewForm();
  ctx.editGrants((text) => `${text}  expires: 2099-01-01\n`);
  const result = ctx.run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('unexpected field expires');
});

test('it fails a log that is not a boolean', () => {
  const ctx = setupTest().useNewForm();
  ctx.editGrants((text) => text.replace('log: true', 'log: "yes"'));
  expect(ctx.run().stderr.toString()).toContain('log: expected true or false');
});

test('it fails a source that spans lines', () => {
  const ctx = setupTest().useNewForm();
  ctx.editGrants((text) => text.replace('source: "The keeper, 2026-03-02: you may light the lamps."', String.raw`source: "a\nb"`));
  expect(ctx.run().stderr.toString()).toContain('source: expected one nonempty line');
});

test('it passes with --private when the skill bullets of a prompt match its session in fleet.json', () => {
  const ctx = setupPrivateTest();
  const result = ctx.runPrivate();
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
});

test('it reads the roles table from --fleet with --private reads the roles table from that path', () => {
  const ctx = setupPrivateTest();
  const elsewhere = join(ctx.dir, 'elsewhere.json');
  cpSync(join(ctx.dir, 'fleet.json'), elsewhere);
  rmSync(join(ctx.dir, 'fleet.json'));
  const result = ctx.run(['--check', '--private', ctx.privateDir, '--fleet', elsewhere]);
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
});

test('it refuses with --private a prompt that lists a skill fleet.json lacks, with the fix', () => {
  const ctx = setupPrivateTest();
  const prompt = join(ctx.privateDir, 'skills/intake/references/session-prompt.md');
  writeFileSync(
    prompt,
    readFileSync(prompt, 'utf8').replace('- `skills/owner-calls/SKILL.md`\n', '- `skills/owner-calls/SKILL.md`\n- `skills/kite-report/SKILL.md`\n'),
  );
  const result = ctx.runPrivate();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe(
    "grants: hq-private: skills/intake/references/session-prompt.md: the prompt lists skills [intake, owner-calls, kite-report] but fleet.json lists [intake, owner-calls] for z-stu; make the prompt's skill bullets match fleet.json's skills for z-stu, or change fleet.json\n",
  );
});

test('it refuses with --private a prompt that misses a skill fleet.json lists', () => {
  const ctx = setupPrivateTest();
  const fleetPath = join(ctx.dir, 'fleet.json');
  writeFileSync(fleetPath, readFileSync(fleetPath, 'utf8').replace('"owner-calls"]', '"owner-calls", "kite-report"]'));
  const result = ctx.runPrivate();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('lists skills [intake, owner-calls] but fleet.json lists [intake, owner-calls, kite-report] for z-stu');
});

test('it refuses with --private a prompt that lists the skills in another order', () => {
  const ctx = setupPrivateTest();
  const prompt = join(ctx.privateDir, 'skills/intake/references/session-prompt.md');
  writeFileSync(
    prompt,
    readFileSync(prompt, 'utf8').replace(
      '- `skills/intake/SKILL.md`\n- `skills/owner-calls/SKILL.md`',
      '- `skills/owner-calls/SKILL.md`\n- `skills/intake/SKILL.md`',
    ),
  );
  const result = ctx.runPrivate();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('lists skills [owner-calls, intake] but fleet.json lists [intake, owner-calls] for z-stu');
});

test('it refuses with --private a prompt with no owner in fleet.json', () => {
  const ctx = setupPrivateTest();
  const fleetPath = join(ctx.dir, 'fleet.json');
  writeFileSync(fleetPath, readFileSync(fleetPath, 'utf8').replace('{ "name": "z-stu", "skills": ["intake", "owner-calls"] },', ''));
  const result = ctx.runPrivate();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('skills/intake/references/session-prompt.md: no session in fleet.json whose first skill is intake');
});

test('it requires prompts/z-q.md to list no skill bullets when its session has none', () => {
  const ctx = setupPrivateTest();
  mkdirSync(join(ctx.privateDir, 'prompts'));
  const file = join(ctx.privateDir, 'prompts/z-q.md');
  writeFileSync(file, 'You are z-kite. You fly the kites.\n');
  expect(ctx.runPrivate().exitCode).toBe(0);
  writeFileSync(file, 'You are z-kite.\n\nYour skills:\n\n- `skills/intake/SKILL.md`\n');
  const result = ctx.runPrivate();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('prompts/z-q.md: the prompt lists skills [intake] but fleet.json lists [] for z-kite');
});

test('it refuses with --private an extra skill that follows a blank line in the skill list', () => {
  const ctx = setupPrivateTest();
  const prompt = join(ctx.privateDir, 'skills/intake/references/session-prompt.md');
  writeFileSync(
    prompt,
    readFileSync(prompt, 'utf8').replace('- `skills/owner-calls/SKILL.md`\n', '- `skills/owner-calls/SKILL.md`\n\n- `skills/kite-report/SKILL.md`\n'),
  );
  const result = ctx.runPrivate();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('lists skills [intake, owner-calls, kite-report] but fleet.json lists [intake, owner-calls] for z-stu');
});

test('it regenerates with --private and no --check though a skill list mismatches fleet.json', () => {
  const ctx = setupPrivateTest();
  const fleetPath = join(ctx.dir, 'fleet.json');
  writeFileSync(fleetPath, readFileSync(fleetPath, 'utf8').replace('"owner-calls"]', '"owner-calls", "kite-report"]'));
  const file = join(ctx.privateDir, 'skills/preview-qa/references/session-prompt.md');
  const source = readFileSync(file, 'utf8');
  writeFileSync(file, source.replace('- read zgeoff PRs and their comments.', '- read every repo.'));
  const result = ctx.runPrivate([]);
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
  expect(readFileSync(file, 'utf8')).toBe(source);
});
