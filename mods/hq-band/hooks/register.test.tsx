import { expect, mock, test } from 'claude-code/testing';
import type { Engine, Mounted } from 'claude-code/testing';
import type { Hook, On } from 'claude-code';

const BAND = {
    plugin: 'hq-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as const;

// What hq answers each subcommand, read by its name: a finished run, or `{ deny }` for one that throws.
type HqAnswer = Awaited<ReturnType<Hook<'process.run'>>>;

interface HqAnswers {
  whois: HqAnswer;
  band: HqAnswer;
  pane: HqAnswer;
}

// hq answering from `answers`, the environment of an atc session, a clock the test moves, and the
// engine's own band beneath the plugin. Returns the argv and time limit of every run hq got, and
// the commands the mod registered and the panes it opened and closed.
function setupTest(on: On, answers: HqAnswers) {
  const clock = mock.clock(on);
  const closed: string[] = [];
  const commands: string[] = [];
  const limits: (number | undefined)[] = [];
  const opened: string[] = [];
  const ran: string[][] = [];
  mock.env(on, { ATC_SESSION_ID: 'id-kettle', HOME: '/home/kettle' });
  on('process.run', (_$, e) => {
    ran.push([...e.argv]);
    limits.push(e.init?.timeoutMs);
    return answers[e.argv[1] as keyof HqAnswers];
  });
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('command.register', (_$, e) => {
    commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('ui.open', (_$, e) => {
    opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  on('ui.close', (_$, pane) => {
    closed.push(pane.id);
    return { value: undefined };
  });
  on('command.run', () => ({ text: 'the engine answered' }));
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const elements = $.ui.resolve(e);
    return <elements.Box key="engine" />;
  });
  return { ran, limits, commands, opened, closed, clock };
}

test('in another fleet session the mod stays inert: one whois, no timer, no /hq and no pane on a run of it, the engine draws the band', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-teapot' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 180_000, hasSurvey: false });
  const ran = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const shownBand = await mounted.find({ key: 'band' });
  const shownEngine = await mounted.find({ key: 'engine' });
  expect([app.ran, app.commands, app.opened, ran.text, shownBand, shownEngine?.type]).toEqual([[['/home/kettle/.local/bin/hq', 'whois', 'id-kettle', '--json']], [], [], 'the engine answered', undefined, 'Box']);
});

test('in a session hq fleet does not know the mod stays inert: one whois, no timer, no /hq and no pane on a run of it, the engine draws the band', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: null }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 180_000, hasSurvey: false });
  const ran = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const shownBand = await mounted.find({ key: 'band' });
  const shownEngine = await mounted.find({ key: 'engine' });
  expect([app.ran, app.commands, app.opened, ran.text, shownBand, shownEngine?.type]).toEqual([[['/home/kettle/.local/bin/hq', 'whois', 'id-kettle', '--json']], [], [], 'the engine answered', undefined, 'Box']);
});

test('in a whois that exits non-zero the mod stays inert: one whois, no timer, no /hq and no pane on a run of it, the engine draws the band', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 180_000, hasSurvey: false });
  const ran = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const shownBand = await mounted.find({ key: 'band' });
  const shownEngine = await mounted.find({ key: 'engine' });
  expect([app.ran, app.commands, app.opened, ran.text, shownBand, shownEngine?.type]).toEqual([[['/home/kettle/.local/bin/hq', 'whois', 'id-kettle', '--json']], [], [], 'the engine answered', undefined, 'Box']);
});

test('in a whois that times out the mod stays inert: one whois, no timer, no /hq and no pane on a run of it, the engine draws the band', async ($, on) => {
  const app = setupTest(on, { whois: { deny: 'hq timed out' }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 180_000, hasSurvey: false });
  const ran = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const shownBand = await mounted.find({ key: 'band' });
  const shownEngine = await mounted.find({ key: 'engine' });
  expect([app.ran, app.commands, app.opened, ran.text, shownBand, shownEngine?.type]).toEqual([[['/home/kettle/.local/bin/hq', 'whois', 'id-kettle', '--json']], [], [], 'the engine answered', undefined, 'Box']);
});


test('in z-stu the band draws hq band segments in their tones, and reads hq again each minute with a 10 s limit', async ($, on) => {
  const segments = [
    { key: 'needs', text: 'Needs you 1', tone: 'alert' },
    { key: 'nix', text: 'Nix up', tone: 'ok' },
    { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' },
  ];
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 0, hasSurvey: false });
  const shownBand = await mounted.find({ key: 'band' });
  const shownColors = await Promise.all(segments.map((segment) => findColor(mounted, segment.text)));
  expect([shownBand?.text, shownColors]).toEqual(['Needs you 1 · Nix up · lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', ['error', null, 'warning']]);
  await app.clock.advance(120_000);
  expect([app.ran.map((argv) => argv[1]), app.limits.every((limit) => limit === 10_000)]).toEqual([['whois', 'band', 'pane', 'band', 'pane', 'band', 'pane'], true]);
});

test('in z-stu a band read that fails shows hq unreachable, not a crash', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 0, hasSurvey: false });
  const shownBand = await mounted.find({ key: 'band' });
  expect(shownBand?.text).toBe('hq unreachable');
});

test('in z-stu the band yields to a survey', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const mounted = await openBand($, app, { advanceMs: 0, hasSurvey: true });
  const shownBand = await mounted.find({ key: 'band' });
  const shownEngine = await mounted.find({ key: 'engine' });
  expect([shownBand, shownEngine?.type]).toEqual([undefined, 'Box']);
});

test('in z-stu /hq opens a pane: the heat map as a Raster on the terminal, block characters elsewhere, then hq\'s detail', async ($, on) => {
  const pane = {
    markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle',
    heat: [
      { lane: 'cleanup', size: 3, used: 2 },
      { lane: 'flexible', size: 1, used: 1 },
      { lane: 'spare', size: 0, used: 0 },
      { lane: 'review', size: 5, used: 15 },
    ],
  };
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const band = await openBand($, app, { advanceMs: 0, hasSurvey: false });
  const opened = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const paneDesktop = await $.ui.mount({ plugin: 'hq-band', component: 'Pane', requestId: 'hq', props: { title: 'hq', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, surface: 'desktop' });
  const paneTerminal = await $.ui.mount({ plugin: 'hq-band', component: 'Pane', requestId: 'hq', props: { title: 'hq', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, surface: 'terminal' });
  const shownBand = await band.find({ key: 'band' });
  const shownDetail = await paneTerminal.find({ key: 'detail' });
  const shownRaster = await paneTerminal.find({ key: 'heat-cleanup' });
  const shownText = await paneDesktop.find({ key: 'heat-cleanup' });
  expect([app.commands, app.opened, opened.text, shownBand?.type, shownRaster?.type, shownText?.text, shownDetail?.text]).toEqual([['hq'], ['hq'], 'Opened the hq pane.', 'Box', 'Raster', '████░░', pane.markdown]);
});

test('in z-stu /hq close closes the hq pane and opens none', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  await openBand($, app, { advanceMs: 0, hasSurvey: false });
  await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const ran = await $.command.run({ command: 'hq', args: 'close', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  expect(app.opened).toStrictEqual(['hq']);
  expect(app.closed).toStrictEqual(['hq']);
  expect(ran.text).toBe('Closed the hq pane.');
});

test('in z-stu each slot is two Raster cells: held green while the lane has room, held amber when full, free shaded; a 0-slot lane draws none', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const band = await openBand($, app, { advanceMs: 0, hasSurvey: false });
  const command = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const mounted = await $.ui.mount({ plugin: 'hq-band', component: 'Pane', requestId: 'hq', props: { title: 'hq', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, surface: 'terminal' });
  const shownBand = await band.find({ key: 'band' });
  const shownFull = await mounted.find({ key: 'heat-flexible' });
  const shownOpen = await mounted.find({ key: 'heat-cleanup' });
  const shownSpare = await mounted.find({ key: 'heat-spare' });
  const heldOpen = [0x25_88, 0x3f_b9_50, 0x01_00_00_00];
  const heldFull = [0x25_88, 0xd2_99_22, 0x01_00_00_00];
  const freeCell = [0x25_91, 0x01_00_00_00, 0x01_00_00_00];
  expect([shownBand?.type, command.text]).toEqual(['Box', 'Opened the hq pane.']);
  expect([shownOpen?.props['columns'], shownOpen?.props['rows'], decodeCells(shownOpen?.props['cells']), shownFull?.props['columns'], decodeCells(shownFull?.props['cells']), shownSpare]).toEqual([
    6,
    1,
    [heldOpen, heldOpen, heldOpen, heldOpen, freeCell, freeCell],
    2,
    [heldFull, heldFull],
    undefined,
  ]);
});

test('in z-stu a lane over its size draws its slots, all held amber, then the count over; a lane at its size draws no count', async ($, on) => {
  const app = setupTest(on, { whois: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, session: 'id-kettle', name: 'z-stu' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, band: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, band: { segments: [{ key: 'needs', text: 'Needs you 1', tone: 'alert' }, { key: 'nix', text: 'Nix up', tone: 'ok' }, { key: 'lanes', text: 'lanes 3/8 (impd 15/16 GiB, 6/16 vCPU)', tone: 'warn' }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }, pane: { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, pane: { markdown: '## Needs you (1)\n- todo: Fit the new lid on the kettle', heat: [{ lane: 'cleanup', size: 3, used: 2 }, { lane: 'flexible', size: 1, used: 1 }, { lane: 'spare', size: 0, used: 0 }, { lane: 'review', size: 5, used: 15 }] } }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } });
  const band = await openBand($, app, { advanceMs: 0, hasSurvey: false });
  const command = await $.command.run({ command: 'hq', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } });
  const paneDesktop = await $.ui.mount({ plugin: 'hq-band', component: 'Pane', requestId: 'hq', props: { title: 'hq', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, surface: 'desktop' });
  const paneTerminal = await $.ui.mount({ plugin: 'hq-band', component: 'Pane', requestId: 'hq', props: { title: 'hq', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, surface: 'terminal' });
  const shownBand = await band.find({ key: 'band' });
  const shownFull = await paneTerminal.find({ key: 'over-flexible' });
  const shownOver = await paneTerminal.find({ key: 'over-review' });
  const shownRaster = await paneTerminal.find({ key: 'heat-review' });
  const shownText = await paneDesktop.find({ key: 'heat-review' });
  const shownTextOver = await paneDesktop.find({ key: 'over-review' });
  expect([shownBand?.type, command.text]).toEqual(['Box', 'Opened the hq pane.']);
  expect([shownOver?.text, await findColor(paneTerminal, ' +10'), shownFull, shownRaster?.props['columns'], decodeCells(shownRaster?.props['cells']).every((cell) => cell.join(',') === [0x25_88, 0xd2_99_22, 0x01_00_00_00].join(',')), shownText?.text, shownTextOver?.text]).toEqual([
    ' +10',
    'warning',
    undefined,
    10,
    true,
    '██████████',
    ' +10',
  ]);
});

// A Raster's base64 cells as [codePoint, fg, bg] triplets.
function decodeCells(cells: unknown): number[][] {
  const bytes = Uint8Array.from(atob(String(cells)), (char) => char.codePointAt(0) ?? 0);
  const words = [...new Uint32Array(bytes.buffer)];
  return Array.from({ length: words.length / 3 }, (_unused, index) => words.slice(index * 3, index * 3 + 3));
}

interface BandOpening {
  advanceMs: number;
  hasSurvey: boolean;
}

// Starts the session, lets `advanceMs` pass, and draws the band above the prompt on the terminal.
async function openBand($: Engine, app: ReturnType<typeof setupTest>, opening: BandOpening): Promise<Mounted<'terminal', 'AbovePrompt'>> {
  await $.session.start({ cwd: '/home/kettle', surface: 'terminal', isInteractive: true });
  await app.clock.advance(opening.advanceMs);
  return await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: opening.hasSurvey } });
}

// The color of the Text that shows exactly `text` in a color; null when none does.
async function findColor<Component extends 'AbovePrompt' | 'Pane'>(mounted: Mounted<'terminal', Component>, text: string): Promise<unknown> {
  const found = await mounted.findAll({ type: 'Text' });
  return found.find((element) => element.text === text && element.props['color'] !== undefined)?.props['color'] ?? null;
}
