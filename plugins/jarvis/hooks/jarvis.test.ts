import { expect, test } from 'claude-code/testing'

import { licenceModels, parseListen } from './listen'
import { isTalkKey } from './register'
import { riskOf } from './protocols'

type Run = { argv: readonly string[]; env: Record<string, string> }

const tick = (ms = 50) => new Promise<void>(r => (globalThis as any).setTimeout(r, ms))

/** A Windows host whose PowerShell children are recorded and finish at once. */
function windowsHost(on: any, runs: Run[], statuses: (string | undefined)[] = [], recorderSays = '') {
  on('command.register', () => ({ value: { command: 'jarvis' } }))
  on('session.machine', () => ({
    value: { sysname: 'Windows_NT', release: '10.0.22631', machine: 'x86_64', packageManagers: [], runtimes: [] },
  }))
  on('store.get', () => ({ value: undefined }))
  on('process.spawn', async function* (_: unknown, e: { argv: readonly string[]; env?: Record<string, string> }) {
    runs.push({ argv: e.argv, env: e.env ?? {} })
    // The voice recorder is the child given a JARVIS_MAX_MS; speech playback the others.
    yield { stream: 'stdout' as const, text: e.env?.JARVIS_MAX_MS ? recorderSays : '.' }
    return { value: { code: 0, signal: null } }
  })
  on('ui.toast', () => ({ value: undefined }))
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
  expect(r.sections.at(-1)?.id).toBe('jarvis:persona')
  expect(r.sections.at(-1)?.text).toContain('"sir"')
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

  expect(statuses.some(t => t === '◉ JARVIS · ctx 25% · 5h 12% · ⎇ main')).toBe(true)
  const spoken = runs.map(r => JSON.parse(r.env.JARVIS_BODY ?? '{}').input as string)
  expect(spoken.some(t => t.includes('the main branch, with 3 uncommitted changes'))).toBe(true)
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
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
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
