import { expect, onTestFinished, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-grants-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  {
    const repo = resolve(import.meta.dir, '..');
    cpSync(join(repo, 'scripts/grants.ts'), join(dir, 'scripts/grants.ts'));
    return {
      dir,

      // An invented fleet laid out as hq's tree, so no test reads the grants, prompts or docs that
      // hq itself holds, which can move to hq-private.
      fixture: join(repo, 'scripts/fixtures/grants'),
      run: (args: string[] = ['--check']) =>
        Bun.spawnSync([process.execPath, join(dir, 'scripts/grants.ts'), ...args], {
          cwd: dir,
          stdout: 'pipe',
          stderr: 'pipe',
        }),
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
    const file = 'skills/preview-qa/references/session-prompt.md',
      path = join(ctx.dir, file),
      source = readFileSync(path, 'utf8');
    expect(source).toContain('- GitHub: read zgeoff PRs and their comments.');
    writeFileSync(path, source.replace('- GitHub: read zgeoff PRs and their comments.', '- GitHub: read every repo.'));
    {
      const checked = ctx.run(),
        checkedSource = readFileSync(path, 'utf8'),
        written = ctx.run([]),
        writtenSource = readFileSync(path, 'utf8');
      expect(checked.exitCode).toBe(1);
      expect(checked.stdout.toString()).toContain(`--- a/${file}\n+++ b/${file}\n@@ `);
      expect(checked.stdout.toString()).toContain('-- GitHub: read every repo.');
      expect(checked.stdout.toString()).toContain('+- GitHub: read zgeoff PRs and their comments.');
      expect(checkedSource).toContain('- GitHub: read every repo.');
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
    const path = join(ctx.dir, 'skills/definitions-stewardship/references/session-prompt.md'),
      source = readFileSync(path, 'utf8');
    expect(source).toContain("my data, anything that touches Nix's memory");
    writeFileSync(path, source.replace("my data, anything that touches Nix's memory", "my data, Nix's memory"));
    {
      const checked = ctx.run(),
        written = ctx.run([]);
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

test.each([
  ['missing', 'another decision'],
  ['extra', 'deleting or rewriting my data, or a security change. deleting or rewriting my data, or a security change'],
])('it rejects a listed site with a %s span before grant replacement', (_label, replacement) => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/session-prompt.md'),
      source = readFileSync(path, 'utf8');
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
    const path = join(ctx.dir, 'skills/linear-triage/SKILL.md'),
      source = readFileSync(path, 'utf8');
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

test('it rejects a grant file whose prompt has no Grants block', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/preview-qa/references/session-prompt.md'),
      source = readFileSync(path, 'utf8');
    expect(source).toContain('\nGrants:\n');
    writeFileSync(path, source.replace('\nGrants:\n', '\nAllowed:\n'));
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
    const path = join(ctx.dir, 'skills/preview-qa/references/session-prompt.md'),
      source = readFileSync(path, 'utf8');
    {
      const checked = ctx.run(),
        message = 'grants: skills/preview-qa/references/session-prompt.md: no grants/z-qa.yaml for this prompt\'s Grants block\n',
        written = ctx.run([]);
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
    const path = join(ctx.dir, 'grants/still-ask.yaml'),
      source = readFileSync(path, 'utf8');
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
    const path = join(ctx.dir, 'grants/z-qa.yaml'),
      source = readFileSync(path, 'utf8');
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
    const path = join(ctx.dir, 'grants/still-ask.yaml'),
      source = readFileSync(path, 'utf8');
    expect(source).toContain('note: "a priority"');
    writeFileSync(path, source.replace('note: "a priority"', 'note: "a changed priority"'));
    {
      const checked = ctx.run(),
        written = ctx.run([]);
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
    const path = join(ctx.dir, 'grants/still-ask.yaml'),
      source = readFileSync(path, 'utf8');
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
    const path = join(ctx.dir, 'skills/delivery-lead/references/session-prompt.md'),
      source = readFileSync(path, 'utf8');
    expect(source).toContain('\n- Release: ');
    writeFileSync(path, source.replace('\n- Release: ', '\n\n- Release: '));
    {
      const result = ctx.run(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('follows the Grants block');
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
      'Grants:',
      '- Water: stale text.',
      '',
      'Ask me first about deleting or rewriting my data, or a security change.',
      '```',
      '',
    ].join('\n'),
  );
  {
    const checked = ctx.run(),
      written = ctx.run([]);
    {
      const prompt = readFileSync(join(ctx.dir, 'skills/garden/references/session-prompt.md'), 'utf8'),
        rechecked = ctx.run();
      expect(checked.exitCode).toBe(1);
      expect(written.exitCode).toBe(0);
      expect(prompt).toContain('- Water: water the paper orchard each morning.\n');
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
    const path = join(ctx.dir, 'skills/delivery-lead/references/releases.md'),
      source = readFileSync(path, 'utf8');
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
  const ctx = setupTest(),
    result = ctx.run(args);
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
    const path = join(ctx.dir, 'grants/z-stu.yaml'),
      source = readFileSync(path, 'utf8');
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
      ),
      originals = generated.map((file) => readFileSync(join(ctx.dir, file))),
      path = join(ctx.dir, 'grants/still-ask.yaml'),
      source = readFileSync(path, 'utf8');
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
  ),
  PRIVATE_PROMPTS = [
    'definitions-stewardship',
    'delivery-lead',
    'intake',
    'linear-triage',
    'pr-review',
    'preview-qa',
  ].map((skill) => `skills/${skill}/references/session-prompt.md`),
  PRIVATE_SITES = [
    'skills/intake/references/session-prompt.md',
    'skills/definitions-stewardship/references/session-prompt.md',
    'docs/skill-development/roles-design.md',
  ];

// A public root and a private dir split as the two repos are: the private dir holds the grants, the
// six session prompts and four docs; hq keeps still-ask.yaml and the rest. `shared` leaves the
// private files in the public root too, as before the move.
function setupPrivateTest(shared = false) {
  const ctx = setupTest();
  {
    const grantFiles = [...new Bun.Glob('*.yaml').scanSync({ cwd: join(ctx.fixture, 'grants') })].filter(
      (file) => file !== 'still-ask.yaml',
    );
    const privateDir = join(ctx.dir, 'private');
    for (const path of ['grants', 'skills', 'docs']) {
      cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
    }
    for (const file of [...grantFiles.map((name) => `grants/${name}`), ...PRIVATE_PROMPTS, ...PRIVATE_DOCS]) {
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
    const file = 'skills/preview-qa/references/session-prompt.md',
      path = join(ctx.privateDir, file),
      source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace('- GitHub: read zgeoff PRs and their comments.', '- GitHub: read every repo.'));
    {
      const checked = ctx.runPrivate();
      expect(checked.exitCode).toBe(1);
      expect(checked.stdout.toString()).toContain(`--- a/hq-private:${file}`);
      expect(checked.stdout.toString()).toContain('+- GitHub: read zgeoff PRs and their comments.');
      expect(readFileSync(path, 'utf8')).toContain('- GitHub: read every repo.');
    }
    expect(ctx.runPrivate([]).exitCode).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(source);
    expect(ctx.runPrivate().exitCode).toBe(0);
  }
});

test('with --private it repairs a still-ask list in a private doc from the list in hq', () => {
  const ctx = setupPrivateTest();
  {
    const path = join(ctx.privateDir, 'docs/skill-development/roles-design.md'),
      source = readFileSync(path, 'utf8');
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
    expect(result.stdout.toString()).toContain('+- GitHub: read the invented repo.');
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
  const ctx = setupPrivateTest(true),
    empty = join(ctx.dir, 'empty');
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

// Marks the still-ask sites that only hq-private holds once hq drops its copies.
function writePrivateSites(dir: string, value = 'private'): void {
  const file = join(dir, 'grants/still-ask.yaml');
  let text = readFileSync(file, 'utf8');
  for (const site of PRIVATE_SITES) {
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
      for (const line of lines) {
        expect(checked.stdout.toString()).toContain(`\n${line}\n`);
      }
      expect(checked.stderr.toString()).toBe('');
      expect(written.exitCode).toBe(0);
      expect(written.stdout.toString()).toBe('grants: wrote 1 files (11 generated files)\n');
      expect(readFileSync(path, 'utf8')).toBe(source);
      expect(ctx.run().exitCode).toBe(0);
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

test('it refuses an "Also his:" line that is neither a bullet nor a continuation', () => {
  const ctx = setupTest();
  for (const path of ['grants', 'skills', 'docs']) {
    cpSync(join(ctx.fixture, path), join(ctx.dir, path), { recursive: true });
  }
  {
    const path = join(ctx.dir, 'skills/intake/references/calls.md');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('- a new greenhouse;\n');
    writeFileSync(path, source.replace('- a new greenhouse;\n', '* a new greenhouse;\n'));
    {
      const result = ctx.run([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe(
        'grants: skills/intake/references/calls.md: the "Also his:" list holds "* a new greenhouse;", which is neither a "- " bullet nor a continuation indented 2 spaces\n',
      );
      expect(readFileSync(path, 'utf8')).toBe(source.replace('- a new greenhouse;\n', '* a new greenhouse;\n'));
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
