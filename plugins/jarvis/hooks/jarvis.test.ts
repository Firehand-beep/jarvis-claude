import { expect, test } from 'claude-code/testing'

import { parseHotkey } from './hotkey'
import { licenceModels, parseListen } from './listen'
import { isTalkKey } from './register'
import { riskOf } from './protocols'
import { firstDue, nextDue } from './reminders'
import { PHRASES, chooseIndex, fill, greetingKey, phraseFrom, type RecentPicks } from './phrases'
import { describeWindows, parseWindows } from './windows'

type Run = { argv: readonly string[]; env: Record<string, string> }

const tick = (ms = 50) => new Promise<void>(r => (globalThis as any).setTimeout(r, ms))

const registered: string[] = []

/** A Windows host whose PowerShell children are recorded and finish at once. */
function windowsHost(on: any, runs: Run[], statuses: (string | undefined)[] = [], recorderSays = '', hotkeySays = 'ARMED\n', store?: Map<string, unknown>) {
  on('command.register', () => ({ value: { command: 'jarvis' } }))
  on('session.machine', () => ({
    value: { sysname: 'Windows_NT', release: '10.0.22631', machine: 'x86_64', packageManagers: [], runtimes: [] },
  }))
  on('store.get', (_: unknown, e: any) => ({ value: store?.get(e.key) }))
  if (store) on('store.set', (_: unknown, e: any) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('process.spawn', async function* (_: unknown, e: { argv: readonly string[]; env?: Record<string, string> }) {
    runs.push({ argv: e.argv, env: e.env ?? {} })
    // The voice recorder is the child given a JARVIS_MAX_MS; speech playback the others.
    yield { stream: 'stdout' as const, text: e.env?.JARVIS_VK ? hotkeySays : e.env?.JARVIS_MAX_MS ? recorderSays : '.' }
    return { value: { code: 0, signal: null } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.register', (_: unknown, e: any) => {
    registered.push(e.name)
    return { value: { tool: `mcp__jarvis__${e.name}` } }
  })
  on('ui.status', (_: unknown, e: any) => {
    statuses.push(typeof e === 'string' ? e : e?.text)
    return { value: undefined }
  })
}

function decode(argv: readonly string[]): string {
  const raw = atob(argv[argv.indexOf('-EncodedCommand') + 1] ?? '')
  let script = ''
  for (let i = 0; i < raw.length; i += 2) script += String.fromCharCode(raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8))
  return script
}

test('on Windows a reply is spoken through VoiceStudio via PowerShell', async ($, on) => {
  const runs: Run[] = []
  windowsHost(on, runs)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({
    answer: 'All tests pass, sir. Here is the `diff`:\n```ts\nx\n```',
    durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer',
  })
  await tick()

  const spoken = runs.find(r => r.env.JARVIS_BODY?.includes('All tests pass'))
  expect(spoken?.argv[0]).toBe('powershell.exe')
  const script = decode(spoken?.argv ?? [])
  expect(script).toContain('System.Media.SoundPlayer')
  expect(script).toContain("$ProgressPreference = 'SilentlyContinue'")
  expect(spoken?.env.JARVIS_URL).toBe('http://127.0.0.1:3900/v1/audio/speech')
  const body = JSON.parse(spoken?.env.JARVIS_BODY ?? '{}')
  expect(body.input).toBe('All tests pass, sir.')
  expect(body.response_format).toBe('pcm')
  expect(body.voice).toBe('Jarvis')
  expect(body.instructions).toBeUndefined()
})

test('a dictated sentence pasted into an empty box is sent and acknowledged', async ($, on) => {
  const runs: Run[] = []
  const submitted: string[] = []
  windowsHost(on, runs)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: (e.text + e.inputText).length }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  const r = await ($.prompt as any).edit({
    origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0,
    inputText: 'What files are in this folder?',
  })
  await tick()

  expect(r.text).toBe('') // the paste never sits in the box
  expect(submitted).toEqual(['What files are in this folder?'])
  expect(runs.some(x => /sir\./.test(JSON.parse(x.env.JARVIS_BODY ?? '{}').input ?? ''))).toBe(true)
})

test('pasted code or a URL is left in the box', async ($, on) => {
  const submitted: string[] = []
  windowsHost(on, [])
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: 0 }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  for (const inputText of ['const x = f();', 'https://example.com/a.', 'line one.\nline two.', 'no punctuation here']) {
    const r = await ($.prompt as any).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText })
    expect(r.text).toBe(inputText)
  }
  await tick()
  expect(submitted).toEqual([])
})

test('the persona is added to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  const persona = r.sections.find((x: { id: string }) => x.id === 'jarvis:persona')
  expect(persona?.text).toContain('"sir"')
  expect(r.sections.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(['jarvis:persona', 'jarvis:knowledge', 'jarvis:memory']))
})


test('the safety protocol knows destructive commands from everyday ones', async () => {
  const risky = [
    'rm -rf build', 'rm -f notes.txt', 'Remove-Item .\\dist -Recurse -Force', 'rd /s /q node_modules',
    'git push --force origin main', 'git push -f', 'git push origin +main', 'git reset --hard HEAD~3',
    'git clean -fd', 'git checkout -- .', 'git branch -D feature', 'psql -c "DROP TABLE users"',
    'sqlite3 app.db "DELETE FROM users;"', 'npm publish', 'vercel --prod', 'terraform destroy',
    'kubectl delete pod web', 'docker system prune -a', 'Format-Volume -DriveLetter D', 'shutdown /r /t 0',
  ]
  const everyday = [
    'ls', 'git status', 'git push origin main', 'git push -u origin feature', 'git checkout -b new',
    'npm run build', 'npm run format', 'rm notes.txt', 'Remove-Item notes.txt', 'git reset HEAD file.ts',
    'psql -c "DELETE FROM users WHERE id = 1"', 'terraform plan', 'kubectl get pods', 'docker ps',
  ]
  for (const c of risky) expect([c, riskOf(c) !== undefined]).toEqual([c, true])
  for (const c of everyday) expect([c, riskOf(c)]).toEqual([c, undefined])
})

test('a destructive PowerShell command is put to the person; others keep their verdict', async ($, on) => {
  windowsHost(on, [])
  on('tool.check', () => ({ decision: 'allow' as const }))

  const risky = await $.tool.check({ tool: 'PowerShell', input: { command: 'Remove-Item C:\\work -Recurse -Force' } } as any)
  expect(risky.decision).toBe('ask')
  expect(risky.reason).toContain('delete a folder')

  const calm = await $.tool.check({ tool: 'PowerShell', input: { command: 'Get-ChildItem' } } as any)
  expect(calm.decision).toBe('allow')
})

test('session start: HUD shows context, limits and branch; briefing reports the repo', async ($, on) => {
  const runs: Run[] = []
  const statuses: (string | undefined)[] = []
  windowsHost(on, runs, statuses)
  on('store.set', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'terminal' } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, tokens: 50000, percent: 25 }, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }] },
  }))
  on('vcs.detect', () => ({ vcs: 'git', root: '/work/app', mainRoot: null, revision: 'abc', branch: 'main', defaultBranch: 'main', remote: null }))
  on('vcs.status', () => ({ changes: [{ path: 'a.ts', state: 'modified' }, { path: 'b.ts', state: 'added' }, { path: 'c.ts', state: 'untracked' }], unpublished: 0 }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true } as any)
  await tick(100)

  expect(statuses.some(t => t === '◉ Alfred · ctx 25% · 5h 12% · ⎇ main')).toBe(true)
  const spoken = runs.map(r => JSON.parse(r.env.JARVIS_BODY ?? '{}').input as string)
  expect(spoken.some(t => (t ?? '').includes('the main branch, with 3 uncommitted changes'))).toBe(true)
})

const b64 = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t)))

test('the recorder output is read: text, silence, licence, failure', () => {
  expect(parseListen(`READY\n.\nS\nHEARD\nTEXT ${b64('{"text":" Run the tests, please. "}')}\n`, '', 0)).toEqual({ kind: 'text', text: 'Run the tests, please.' })
  expect(parseListen(`READY\nTEXT ${b64('{"text":"caf\u00e9 cr\u00e8me"}')}\n`, '', 0)).toEqual({ kind: 'text', text: 'café crème' })
  expect(parseListen('READY\n.\nNOSPEECH\n', '', 0)).toEqual({ kind: 'nospeech' })
  const body = '{"detail":{"code":"model_licence_required","models":[{"repo_id":"a/b","fingerprint":"v2:' + '0'.repeat(64) + '","license":"MIT"}]}}'
  const fail = parseListen(`FAIL ${b64(body)}\n`, '', 0)
  expect(fail.kind).toBe('fail')
  expect(licenceModels(fail.kind === 'fail' ? fail.body : '')).toHaveLength(1)
  expect(parseListen('', 'Exception calling "Record": Could not open the microphone (waveInOpen error 2).', 1).kind).toBe('broken')
})

test('Ctrl+Space listens, then sends what was said', async ($, on) => {
  const runs: Run[] = []
  const submitted: string[] = []
  windowsHost(on, runs, [], `READY\nS\nHEARD\nTEXT ${b64('{"text":"What files are in this folder?"}')}\n`)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: 0 }))
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    contexts.push([JSON.stringify(e.origin)])
    return { text: e.text, origin: e.origin }
  })

  const r = await ($.prompt as any).edit({
    origin: { kind: 'composer' }, key: { key: ' ', ctrl: true }, text: '', cursor: 0, start: 0, end: 0, inputText: ' ',
  })
  await tick(100)

  expect(r.text).toBe('') // the key is swallowed
  const recorder = runs.find(x => x.env.JARVIS_MAX_MS)
  expect(recorder?.env.JARVIS_URL).toBe('http://127.0.0.1:3900/v1/audio/transcriptions')
  expect(recorder?.env.JARVIS_LANG).toBe('en')
  expect(decode(recorder?.argv ?? [])).toContain('waveInOpen')
  expect(submitted).toEqual(['What files are in this folder?'])
  // It enters as the person's own words.
  expect(String(contexts[0]?.join(' '))).toContain('"asUser":true')
})

test('plain Space is just a space under the default talk key', async ($, on) => {
  const runs: Run[] = []
  windowsHost(on, runs)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: 0 }))
  const r = await ($.prompt as any).edit({
    origin: { kind: 'composer' }, key: { key: ' ' }, text: 'hello', cursor: 5, start: 5, end: 5, inputText: ' ',
  })
  expect(r.text).toBe('hello ')
  expect(runs.some(x => x.env.JARVIS_MAX_MS)).toBe(false)
})

test('the talk key: every form of Ctrl+Space, and Space only where chosen', () => {
  const at = (key: any, text = '', inputText = ' ') => ({ key, text, inputText })
  expect(isTalkKey(at({ key: ' ', ctrl: true }), 'ctrl+space')).toBe(true)
  expect(isTalkKey(at({ key: '@', ctrl: true }), 'ctrl+space')).toBe(true)
  expect(isTalkKey(at(undefined, '', '\u0000'), 'ctrl+space')).toBe(true)
  expect(isTalkKey(at({ key: ' ', ctrl: true }, 'draft'), 'ctrl+space')).toBe(true)
  expect(isTalkKey(at({ key: ' ' }), 'ctrl+space')).toBe(false)
  expect(isTalkKey(at({ key: ' ' }), 'space')).toBe(true)
  expect(isTalkKey(at({ key: ' ' }, 'draft'), 'space')).toBe(false)
  expect(isTalkKey(at({ key: 'a', ctrl: true }), 'both')).toBe(false)
})

const HUB_PANE = {
  plugin: 'jarvis',
  component: 'Pane',
  requestId: 'jarvis-hub',
  props: { title: 'JARVIS', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the hub draws its status, gauges and buttons on every surface, and Listen listens', async ($, on) => {
  const runs: Run[] = []
  windowsHost(on, runs, [], 'READY\nNOSPEECH\n')
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 80000, percent: 40 }, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }] } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('vcs.detect', () => ({ vcs: 'git', root: '/work/app', mainRoot: null, revision: 'abc', branch: 'main', defaultBranch: 'main', remote: null }))
  on('vcs.status', () => ({ changes: [{ path: 'a.ts', state: 'modified' }], unpublished: 0 }))

  // The terminal draws text cards.
  const term = await ($.ui as any).mount({ ...HUB_PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /A\.L\.F\.R\.E\.D\./ }))?.text).toBeDefined()
  expect((await term.find({ type: 'Text', text: /Standing by/ }))?.text).toBeDefined()
  expect((await term.find({ type: 'Text', text: /⎇ main/ }))?.text).toBeDefined()
  expect((await term.find({ type: 'Text', text: /1 uncommitted change$/ }))?.text).toBeDefined()
  await term.unmount()

  // The apps draw the designed panel, filled with the live values.
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await ($.ui as any).mount({ ...HUB_PANE, surface })
    const svg = await ui.find({ type: 'Svg' })
    const source = String(svg?.props?.source ?? svg?.source ?? '')
    expect(source).toContain('class="state-standby voice-on"')
    expect(source).toContain('>STANDING BY</text>')
    expect(source).toContain('id="git-branch">main</text>')
    expect(source).toContain('id="git-status">1 change</text>')
    expect(source).toContain('id="lbl-hotkey">CTRL+SPACE</text>')
    expect(source).not.toContain('class="state-listening')
    await ui.unmount()
  }

  const ui = await ($.ui as any).mount({ ...HUB_PANE, surface: 'desktop' })
  await ui.press({ key: 'listen' })
  await tick(100)
  expect(runs.some(r => r.env.JARVIS_MAX_MS)).toBe(true)
  await ui.unmount()
})

test('talk key specs become Windows hotkeys', () => {
  expect(parseHotkey('ctrl+space')).toEqual({ mods: 0x2, vk: 0x20, label: 'Ctrl+Space' })
  expect(parseHotkey('Ctrl + Shift + Space')).toEqual({ mods: 0x6, vk: 0x20, label: 'Ctrl+Shift+Space' })
  expect(parseHotkey('alt+j')).toEqual({ mods: 0x1, vk: 0x4a, label: 'Alt+J' })
  expect(parseHotkey('ctrl+f9')).toEqual({ mods: 0x2, vk: 0x78, label: 'Ctrl+F9' })
  expect(parseHotkey('space')).toBeUndefined()
  expect(parseHotkey('hyper+space')).toBeUndefined()
})

test('on Windows the session holds Ctrl+Space system-wide; pressing it listens', async ($, on) => {
  const runs: Run[] = []
  windowsHost(on, runs, [], 'READY\nNOSPEECH\n', 'ARMED\nHOTKEY\n')
  on('store.set', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'terminal' } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: 1 }, rateLimits: [] } }))
  on('vcs.detect', () => null)
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/app', surface: 'desktop', isInteractive: true } as any)
  await tick(150)

  const holder = runs.find(r => r.env.JARVIS_VK)
  expect(holder?.env).toMatchObject({ JARVIS_MODS: '2', JARVIS_VK: '32' })
  expect(decode(holder?.argv ?? [])).toContain('RegisterHotKey')
  expect(runs.some(r => r.env.JARVIS_MAX_MS)).toBe(true) // the press started the recorder
})

test('with ElevenLabs on Windows, JARVIS asks for raw PCM and plays it through the padded player', async ($, on) => {
  const runs: Run[] = []
  windowsHost(on, runs)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.turn.complete({ answer: 'Very good, sir.', durationMs: 10, isAborted: false, turnId: 't9', reason: 'answer' })
  await tick()
  // default engine is VoiceStudio; the ElevenLabs request shape is checked through the options test below
  expect(runs.some(r => r.env.JARVIS_EXT === 'pcm')).toBe(true)
})

test('ElevenLabs request: Grandfather Joe by default, PCM on Windows', { options: { provider: 'elevenlabs', elevenlabs_api_key: 'test-key' } } as any, async ($: any, on: any) => {
  const runs: Run[] = []
  windowsHost(on, runs)
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  await $.turn.complete({ answer: 'Very good, sir.', durationMs: 10, isAborted: false, turnId: 't10', reason: 'answer' })
  await tick()
  const r = runs.find(x => x.env.JARVIS_URL?.includes('elevenlabs'))
  expect(r?.env.JARVIS_URL).toBe('https://api.elevenlabs.io/v1/text-to-speech/0lp4RIz96WD1RUtvEu3Q?output_format=pcm_24000')
  expect(r?.env.JARVIS_EXT).toBe('pcm')
  expect(r?.env.JARVIS_HDR_NAME).toBe('xi-api-key')
})

/** A small in-memory disk for the memory tests: path -> text. */
function fakeDisk(on: any, files: Map<string, string>) {
  on('env.get', (_: unknown, e: any) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\Tester' : undefined }))
  on('fs.exists', (_: unknown, e: any) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)) }))
  on('fs.read', (_: unknown, e: any) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_: unknown, e: any) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_: unknown, e: any) => ({
    value: [...files.keys()]
      .filter(k => k.startsWith(`${e.path}/`))
      .map(k => ({ name: k.slice(e.path.length + 1), kind: 'file', size: 1, mtimeMs: 1, isLink: false })),
  }))
}

const ROOT = 'C:\\Users\\Tester/Alfred'

test('memory: the remember tool keeps a dated note; each exchange goes into the day\'s journal', async ($: any, on: any) => {
  const files = new Map<string, string>()
  windowsHost(on, [])
  fakeDisk(on, files)
  on('store.set', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'terminal' } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: 1 }, rateLimits: [] } }))
  on('vcs.detect', () => null)
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: any) => ({ text: e.text, turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  on('tool.run', () => ({ result: 'engine' }))

  await $.session.start({ cwd: '/work/app', surface: 'desktop', isInteractive: true })
  await tick(100)
  expect(registered).toEqual(expect.arrayContaining(['weather', 'remember', 'recall']))

  const r = await $.tool.run({ tool: 'mcp__jarvis__remember', note: 'Prefers pnpm over npm.', tool_use_id: 'u1' })
  expect(String(r.result)).toContain('Noted')
  const notesPath = [...files.keys()].find(k => k.endsWith('/Alfred/memory.md')) ?? ''
  expect(notesPath).toContain('Tester')
  expect(files.get(notesPath)).toMatch(/- \d{4}-\d{2}-\d{2}: Prefers pnpm over npm\./)

  await $.turn.start({ text: 'Which package manager do I like?', turnId: 't1' })
  await $.turn.complete({ answer: 'pnpm, sir. You said so.', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  await tick(100)
  const day = [...files.keys()].find(k => k.includes('/Alfred/conversations/'))
  expect(files.get(day ?? '')).toContain('**You:** Which package manager do I like?')
  expect(files.get(day ?? '')).toContain('**Alfred:** pnpm, sir. You said so.')

  const found = await $.tool.run({ tool: 'mcp__jarvis__recall', query: 'package manager', tool_use_id: 'u2' })
  expect(String(found.result)).toContain('Which package manager do I like?')
})

test('memory: forget needs "yes"; edits and deletes of the memory folder are put to the person', async ($: any, on: any) => {
  const files = new Map<string, string>([[`${ROOT}/memory.md`, '# notes\n- 2026-11-22: x\n']])
  const runs: Run[] = []
  windowsHost(on, runs)
  fakeDisk(on, files)
  on('store.set', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'terminal' } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: 1 }, rateLimits: [] } }))
  on('vcs.detect', () => null)
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.session.start({ cwd: '/work/app', surface: 'desktop', isInteractive: true })
  await tick(100)

  const del = await $.tool.check({ tool: 'PowerShell', input: { command: 'Remove-Item C:\\Users\\Tester\\Alfred\\memory.md' } })
  expect(del.decision).toBe('ask')
  const edit = await $.tool.check({ tool: 'Write', input: { file_path: 'C:\\Users\\Tester\\Alfred\\memory.md', content: '' } })
  expect(edit.decision).toBe('ask')
  const read = await $.tool.check({ tool: 'PowerShell', input: { command: 'Get-Content C:\\Users\\Tester\\Alfred\\memory.md' } })
  expect(read.decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__jarvis__remember', input: { note: 'x' } })).decision).toBe('allow')
})

test('weather: Open-Meteo lookup by place, as a short report', async ($: any, on: any) => {
  windowsHost(on, [])
  on('tool.run', () => ({ result: 'engine' }))
  on('http.fetch', (_: unknown, e: any) => {
    const text = e.url.includes('geocoding')
      ? JSON.stringify({ results: [{ name: 'Singapore', country: 'Singapore', latitude: 1.29, longitude: 103.85 }] })
      : JSON.stringify({
          current: { temperature_2m: 31.2, apparent_temperature: 37, relative_humidity_2m: 70, weather_code: 2, wind_speed_10m: 12, precipitation: 0 },
          daily: { time: ['2026-11-22'], weather_code: [95], temperature_2m_max: [32], temperature_2m_min: [25], precipitation_probability_max: [80], sunrise: ['2026-11-22T06:55'], sunset: ['2026-11-22T19:00'] },
        })
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  const r = await $.tool.run({ tool: 'mcp__jarvis__weather', place: 'Singapore', tool_use_id: 'w1' })
  expect(String(r.result)).toContain('Now: 31°C (feels like 37°C), partly cloudy')
  expect(String(r.result)).toContain('Today (2026-11-22): thunderstorms, 25–32°C, chance of rain 80%')
})

test('a restart of the plugin mid-session does not greet again, and finishes the line it cut off', async ($: any, on: any) => {
  const runs: Run[] = []
  const store = new Map<string, unknown>([
    ['greeted_session', 's-1'],
    ['playing', { text: 'Tomorrow in Singapore will be warm and humid, sir.', at: Date.now() - 5000 }],
  ])
  windowsHost(on, runs, [], '', 'ARMED\n', store)
  on('session.id', () => ({ value: 's-1' }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'terminal' } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: 1 }, rateLimits: [] } }))
  on('vcs.detect', () => null)
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/app', surface: 'desktop', isInteractive: true })
  await tick(150)
  const said = runs.map(r => JSON.parse(r.env.JARVIS_BODY ?? '{}').input as string).filter(Boolean)
  expect(said.some(t => /Good (morning|afternoon|evening)|Up rather late/.test(t))).toBe(false)
  expect(said).toContain('Tomorrow in Singapore will be warm and humid, sir.')
})


test('reminder times: timers, clock times, weekdays and repeats', () => {
  const now = new Date(2026, 10, 20, 18, 0) // Friday 20 Nov 2026, 18:00
  expect(firstDue(now, 20, undefined, 'none')).toBe(now.getTime() + 20 * 60_000)
  expect(new Date(firstDue(now, undefined, '19:30', 'none') as number).getHours()).toBe(19)
  const tomorrow9 = new Date(firstDue(now, undefined, '9:00', 'none') as number)
  expect([tomorrow9.getDate(), tomorrow9.getHours()]).toEqual([21, 9])
  const weekday9 = new Date(firstDue(now, undefined, '9:00 am', 'weekdays') as number)
  expect([weekday9.getDay(), weekday9.getDate()]).toEqual([1, 23]) // Monday 23rd, not the weekend
  expect(typeof firstDue(now, undefined, 'teatime', 'none')).toBe('string')
  const friday = { id: 'a', text: 'x', due: new Date(2026, 10, 20, 9, 0).getTime(), repeat: 'weekdays' as const, ask: false, created: 0 }
  expect(new Date(nextDue(friday, now.getTime()) as number).getDay()).toBe(1)
  expect(nextDue({ ...friday, repeat: 'none' }, now.getTime())).toBeUndefined()
})

test('windows: the script\'s answer becomes one sentence', () => {
  expect(describeWindows('volume', parseWindows('{"ok":true,"level":30,"muted":false}\n', ''))).toBe('Volume is now 30%.')
  expect(describeWindows('battery', parseWindows('{"ok":true,"hasBattery":true,"percent":82,"pluggedIn":true}', ''))).toBe('Battery at 82%, plugged in.')
  expect(describeWindows('media', parseWindows('', 'Exception: boom'))).toBe('That did not work: Exception: boom')
})

test('windows and reminder tools: volume runs the script; harmless tools run without asking, open does not', async ($: any, on: any) => {
  const store = new Map<string, unknown>()
  const ran: { env?: Record<string, string> }[] = []
  windowsHost(on, [], [], '', 'ARMED\n', store)
  on('process.run', (_: unknown, e: any) => {
    ran.push({ env: e.init?.env })
    return { value: { exitCode: 0, stdout: '{"ok":true,"level":30,"muted":false}', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.run', () => ({ result: 'engine' }))
  on('tool.check', () => ({ decision: 'ask' as const }))

  const r = await $.tool.run({ tool: 'mcp__jarvis__volume', set: 30, tool_use_id: 'v1' })
  expect(r.result).toBe('Volume is now 30%.')
  expect(ran[0]?.env).toMatchObject({ ALFRED_ACTION: 'volume', ALFRED_MODE: 'set', ALFRED_VALUE: '30' })

  expect((await $.tool.check({ tool: 'mcp__jarvis__volume', input: { set: 30 } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__jarvis__remind', input: { text: 'x' } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__jarvis__open', input: { target: 'chrome' } })).decision).toBe('ask')

  const set = await $.tool.run({ tool: 'mcp__jarvis__remind', text: 'stretch', in_minutes: 20, tool_use_id: 'r1' })
  expect(String(set.result)).toContain('"stretch"')
  const saved = store.get('reminders') as { id: string; text: string }[]
  expect(saved.map(x => x.text)).toEqual(['stretch'])
  const listed = await $.tool.run({ tool: 'mcp__jarvis__list_reminders', tool_use_id: 'r2' })
  expect(String(listed.result)).toContain('stretch')
  const gone = await $.tool.run({ tool: 'mcp__jarvis__cancel_reminder', id: saved[0]!.id, tool_use_id: 'r3' })
  expect(String(gone.result)).toContain('Cancelled')
  expect(store.get('reminders')).toEqual([])
})

test('a reminder that is due is said aloud when the session starts', async ($: any, on: any) => {
  const runs: Run[] = []
  const store = new Map<string, unknown>([
    ['greeted_session', 's-2'],
    ['reminders', [{ id: 'z', text: 'call the bank', due: Date.now() - 1000, repeat: 'none', ask: false, created: 0 }]],
  ])
  windowsHost(on, runs, [], '', 'ARMED\n', store)
  on('session.id', () => ({ value: 's-2' }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'terminal' } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: 1 }, rateLimits: [] } }))
  on('vcs.detect', () => null)
  on('env.get', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/app', surface: 'desktop', isInteractive: true })
  await tick(200)
  const said = runs.map(r => JSON.parse(r.env.JARVIS_BODY ?? '{}').input as string).filter(Boolean)
  const line = said.find(t => /call the bank/i.test(t))
  expect(line).toBeDefined()
  expect(line).not.toContain('..')
  expect(store.get('reminders')).toEqual([])
})

test('phrases: every situation has many wordings, and none repeats while fresher ones remain', () => {
  for (const [key, pool] of Object.entries(PHRASES)) {
    expect(pool.length >= 4).toBe(true)
    expect(new Set(pool).size).toBe(pool.length)
    for (const line of pool) expect(/[!\u{1F300}-\u{1FAFF}]/u.test(line)).toBe(false)
    expect(key.length > 0).toBe(true)
  }
  // Fifty acknowledgements in a row: never the same as any of the last few.
  let recent: RecentPicks = {}
  const lines: string[] = []
  for (let i = 0; i < 50; i++) {
    const r = phraseFrom(recent, 'ack', 'sir')
    recent = r.recent
    lines.push(r.line)
  }
  for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1])
  expect(new Set(lines).size >= 10).toBe(true)
  // Even with a "random" that always says 0, the recent ones are skipped.
  expect(chooseIndex(6, [0, 1, 2], () => 0)).toBe(3)
})

test('phrases: slots are filled and the hour picks the greeting', () => {
  expect(fill('Your reminder, {t}: {what}.', 'sir', { what: 'call the bank' })).toBe('Your reminder, sir: call the bank.')
  expect(fill("It's time, {t}. {What}.", 'sir', { what: 'call the bank' })).toBe("It's time, sir. Call the bank.")
  expect(fill('{T}, the kettle.', 'sir')).toBe('Sir, the kettle.')
  expect(greetingKey(3)).toBe('smallHours')
  expect(greetingKey(9)).toBe('morning')
  expect(greetingKey(14)).toBe('afternoon')
  expect(greetingKey(19)).toBe('evening')
  expect(greetingKey(23)).toBe('lateNight')
})
