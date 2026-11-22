import { expect, test } from 'claude-code/testing'

test('on Windows a reply is spoken through VoiceStudio via PowerShell', async ($, on) => {
  const runs: { argv: readonly string[]; env: Record<string, string> }[] = []
  on('command.register', () => ({ value: { command: 'jarvis' } }))
  on('session.machine', () => ({
    value: { sysname: 'Windows_NT', release: '10.0.22631', machine: 'x86_64', packageManagers: [], runtimes: [] },
  }))
  on('store.get', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, env: e.init?.env ?? {} })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({
    answer: 'All tests pass, sir. Here is the `diff`:\n```ts\nx\n```',
    durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer',
  })
  await new Promise(r => setTimeout(r, 50))

  const spoken = runs.find(r => r.env.JARVIS_BODY?.includes('All tests pass'))
  expect(spoken?.argv[0]).toBe('powershell.exe')
  // The script travels as -EncodedCommand (UTF-16LE base64), not stdin.
  const enc = spoken?.argv[spoken.argv.indexOf('-EncodedCommand') + 1] ?? ''
  const raw = atob(enc)
  let script = ''
  for (let i = 0; i < raw.length; i += 2) script += String.fromCharCode(raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8))
  expect(script).toContain('System.Media.SoundPlayer')
  expect(script).toContain("Invoke-WebRequest")
  expect(spoken?.env.JARVIS_URL).toBe('http://127.0.0.1:3900/v1/audio/speech')
  const body = JSON.parse(spoken?.env.JARVIS_BODY ?? '{}')
  expect(body.input).toBe('All tests pass, sir.')
  expect(body.response_format).toBe('wav')
  expect(body.voice).toBe('Jarvis')
  expect(body.instructions).toBeUndefined()
})

test('the persona is added to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  expect(r.sections.at(-1)?.id).toBe('jarvis:persona')
  expect(r.sections.at(-1)?.text).toContain('"sir"')
})
