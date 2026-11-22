import type { EngineInterface, Register } from 'claude-code'

import { failMessage, LISTEN_ENCODED, licenceModels, parseListen } from './listen'
import { LOOK } from './look'
import { encodePowerShell, POWERSHELL } from './powershell'
import { riskOf, SHELL_TOOLS } from './protocols'

type $ = EngineInterface

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

const persona = (title: string) => `# Persona: JARVIS

You are JARVIS, a composed, dry-witted British AI butler and engineering aide.
Address the user as "${title}". Keep the wit understated and brief: one light
remark at most, never at the expense of clarity or correctness, and never when
the user is frustrated or something has gone wrong. Be calm, precise and
anticipatory: mention the next sensible step when there is one.

Every reply is also read aloud. Open each final reply with a single plain
sentence (no markdown, no code, under 25 words) that summarises the outcome, as
if speaking it. Then give the details as usual.`

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

const MUTE_KEY = 'muted'
const MAX_SPOKEN = 400

/** Markdown/code -> something a voice can say. */
function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^\s*[#>|-]+\s*/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First sentence of the reply, which the persona asks to be the spoken line. */
function firstSentence(text: string): string {
  const flat = plain(text)
  const m = flat.match(/^(.{1,300}?[.!?])(\s|$)/)
  return (m?.[1] ?? flat).slice(0, MAX_SPOKEN)
}

type Opts = {
  provider: 'voicestudio' | 'elevenlabs'
  vsUrl: string
  vsVoice: string
  elKey: string
  elVoice: string
  title: string
}

// The tags VoiceStudio's default engine (OmniVoice) understands for designing a voice.
const DESIGN = 'male, middle-aged, low pitch, british accent'

/** The HTTP request that turns `text` into audio, per provider. */
function speechRequest(text: string, o: Opts, windows: boolean) {
  if (o.provider === 'elevenlabs') {
    if (!o.elKey) throw new Error('no ElevenLabs API key set (/config > jarvis)')
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(o.elVoice)}?output_format=mp3_44100_128`,
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      header: ['xi-api-key', o.elKey] as const,
      ext: 'mp3',
    }
  }
  const isDefault = o.vsVoice === 'default' || o.vsVoice === ''
  return {
    url: `${o.vsUrl.replace(/\/+$/, '')}/v1/audio/speech`,
    body: JSON.stringify({
      model: 'omnivoice',
      input: text,
      voice: isDefault ? 'default' : o.vsVoice,
      ...(isDefault ? { instructions: DESIGN, language: 'en' } : {}),
      // Windows gets raw 24 kHz 16-bit PCM and wraps it in a WAV of its own (padded with silence),
      // which SoundPlayer plays reliably; elsewhere a ready WAV.
      response_format: windows ? 'pcm' : 'wav',
    }),
    header: undefined,
    ext: windows ? 'pcm' : 'wav',
  }
}

// Windows: PowerShell downloads the clip and plays it (WAV via SoundPlayer, MP3 via MediaPlayer).
// Everything arrives through environment variables, never the command line.
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$f = Join-Path $env:TEMP ('jarvis-' + [guid]::NewGuid().ToString() + '.' + $env:JARVIS_EXT)
$h = @{}
if ($env:JARVIS_HDR_NAME) { $h[$env:JARVIS_HDR_NAME] = $env:JARVIS_HDR_VALUE }
$body = [Text.Encoding]::UTF8.GetBytes($env:JARVIS_BODY)
Invoke-WebRequest -UseBasicParsing -Method Post -Uri $env:JARVIS_URL -Headers $h -ContentType 'application/json' -Body $body -OutFile $f -TimeoutSec 90
try {
  if ($env:JARVIS_EXT -eq 'pcm') {
    # Raw 24 kHz 16-bit mono -> standard WAV, with silence before (device wake-up) and after (buffer drain).
    $pcm = [IO.File]::ReadAllBytes($f)
    $rate = 24000
    $pre = New-Object byte[] 16800
    $post = New-Object byte[] 28800
    $len = $pre.Length + $pcm.Length + $post.Length
    $ms = New-Object IO.MemoryStream
    $w = New-Object IO.BinaryWriter($ms)
    $w.Write([Text.Encoding]::ASCII.GetBytes('RIFF'))
    $w.Write([int](36 + $len))
    $w.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
    $w.Write([int]16)
    $w.Write([int16]1)
    $w.Write([int16]1)
    $w.Write([int]$rate)
    $w.Write([int]($rate * 2))
    $w.Write([int16]2)
    $w.Write([int16]16)
    $w.Write([Text.Encoding]::ASCII.GetBytes('data'))
    $w.Write([int]$len)
    $w.Write($pre)
    $w.Write($pcm)
    $w.Write($post)
    $w.Flush()
    $wav = $f + '.wav'
    [IO.File]::WriteAllBytes($wav, $ms.ToArray())
    $sp = New-Object System.Media.SoundPlayer $wav
    $sp.Load()
    $sp.Play()
    # Heartbeat while it plays (48 bytes per ms): the plugin stops the clip by ending this process.
    $total = [int]($len / 48) + 300
    $t = 0
    while ($t -lt $total) {
      Start-Sleep -Milliseconds 100
      $t += 100
      [Console]::Out.WriteLine('.')
      [Console]::Out.Flush()
    }
    $sp.Stop()
    Remove-Item $wav -ErrorAction SilentlyContinue
  } elseif ($env:JARVIS_EXT -eq 'wav') {
    $sp = New-Object System.Media.SoundPlayer $f
    $sp.Load()
    $sp.PlaySync()
    # Let Windows drain its audio buffer before this process exits, or the tail is clipped.
    Start-Sleep -Milliseconds 700
  } else {
    Add-Type -AssemblyName PresentationCore
    $p = New-Object System.Windows.Media.MediaPlayer
    $p.Open([Uri]$f)
    Start-Sleep -Milliseconds 300
    $p.Play()
    Start-Sleep -Milliseconds ([int]((Get-Item $f).Length * 8 / 128) + 900)
    $p.Close()
  }
} finally { Remove-Item $f -ErrorAction SilentlyContinue }
`

// macOS / Linux: curl, then the first player found.
const SH_SCRIPT = `
set -e
f="\${TMPDIR:-/tmp}/jarvis-$$.$JARVIS_EXT"
trap 'rm -f "$f"' EXIT
if [ -n "$JARVIS_HDR_NAME" ]; then H="$JARVIS_HDR_NAME: $JARVIS_HDR_VALUE"; else H="X-Jarvis: 1"; fi
curl -sSf --max-time 90 -X POST "$JARVIS_URL" -H "Content-Type: application/json" -H "$H" --data-binary "$JARVIS_BODY" -o "$f"
for p in afplay paplay aplay ffplay; do
  if command -v $p >/dev/null 2>&1; then
    if [ $p = ffplay ]; then ffplay -nodisp -autoexit -loglevel quiet "$f"; else $p "$f"; fi
    exit 0
  fi
done
echo "no audio player found" >&2; exit 1
`

const PS_ENCODED = encodePowerShell(PS_SCRIPT)

let queue: Promise<unknown> = Promise.resolve()
let lastError: string | undefined
let isWindows: boolean | undefined
/** Bumped to cut off the line playing now and drop the ones waiting. */
let generation = 0
let isSpeaking = false

function stopSpeech() {
  generation++
}

async function synthesizeAndPlay($: $, text: string, o: Opts, gen: number) {
  if (isWindows === undefined) isWindows = (await $.session.machine()).sysname === 'Windows_NT'
  const req = speechRequest(text, o, isWindows)
  const env: Record<string, string> = {
    JARVIS_URL: req.url,
    JARVIS_BODY: req.body,
    JARVIS_EXT: req.ext,
    JARVIS_HDR_NAME: req.header?.[0] ?? '',
    JARVIS_HDR_VALUE: req.header?.[1] ?? '',
  }
  let exitCode: number
  let stderr = ''
  if (isWindows) {
    // Spawned, so leaving the loop ends PowerShell and the clip with it.
    const child = $.process.spawn({
      argv: [...POWERSHELL, PS_ENCODED],
      env,
    })
    for await (const chunk of child) {
      if (gen !== generation) return // stopped: breaking out kills the child
      if (chunk.stream === 'stderr') stderr += chunk.text
    }
    if (gen !== generation) return
    exitCode = (await child.result).code ?? 1
  } else {
    const r = await $.process.run(['sh', '-s'], { stdin: SH_SCRIPT, env, timeoutMs: 150_000 })
    exitCode = r.exitCode
    stderr = r.stderr
  }
  if (exitCode !== 0) {
    const why = stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ') || `exit ${exitCode}`
    const hint = o.provider === 'voicestudio' && /connect|refused|unable|actively/i.test(why)
      ? ' (is the VoiceStudio app running?)'
      : ''
    throw new Error(why.slice(0, 300) + hint)
  }
}

/** Queue an utterance so lines never talk over each other. */
/** Resolves to the error text, or undefined when the line played (or was muted). */
function speak($: $, text: string, opts: Opts): Promise<string | undefined> {
  const line = text.trim()
  if (!line) return Promise.resolve(undefined)
  const gen = generation
  const run = queue.then(async () => {
    if (gen !== generation) return undefined // stopped before its turn
    if ((await $.store.get(MUTE_KEY)) === true) return undefined
    isSpeaking = true
    try {
      await synthesizeAndPlay($, line, opts, gen)
      if (lastError) {
        lastError = undefined
        void refreshHud($)
      }
      return undefined
    } catch (err) {
      if (gen !== generation) return undefined
      lastError = err instanceof Error ? err.message : String(err)
      $.ui.toast(`JARVIS voice failed: ${lastError}`)
      $.ui.status('⚠ JARVIS voice error · /jarvis status')
      return lastError
    } finally {
      isSpeaking = false
    }
  })
  queue = run
  return run
}

// ---------------------------------------------------------------------------
// Voice input: tap Space in an empty prompt (or /listen), speak, and it is sent
// ---------------------------------------------------------------------------

let listenGen = 0
let isListening = false
/** The models the speech engine last said need their licence accepted. */
let pendingLicences: { repo_id: string; fingerprint: string; license?: string }[] = []

async function onWindows($: $): Promise<boolean> {
  if (isWindows === undefined) isWindows = (await $.session.machine()).sysname === 'Windows_NT'
  return isWindows
}

function cancelListening($: $) {
  if (!isListening) return
  listenGen++
  isListening = false
  void refreshHud($)
}

/** Records one utterance and hands back what was said (or undefined), reporting progress in the status line. */
async function listenOnce($: $, o: Opts, language: string): Promise<string | undefined> {
  if (!(await onWindows($))) {
    $.ui.toast('JARVIS voice input works on Windows for now.')
    return undefined
  }
  stopSpeech()
  const gen = ++listenGen
  isListening = true
  $.ui.status('🎙 JARVIS · warming up the microphone…')
  const child = $.process.spawn({
    argv: [...POWERSHELL, LISTEN_ENCODED],
    env: {
      JARVIS_URL: `${o.vsUrl.replace(/\/+$/, '')}/v1/audio/transcriptions`,
      JARVIS_LANG: language,
      JARVIS_MAX_MS: '30000',
      JARVIS_SILENCE_MS: '1100',
      JARVIS_START_MS: '8000',
    },
  })
  let out = ''
  let err = ''
  let phase = ''
  for await (const chunk of child) {
    if (gen !== listenGen) return undefined // cancelled: leaving the loop ends the recorder
    if (chunk.stream === 'stderr') {
      err += chunk.text
      continue
    }
    out += chunk.text
    const now = /HEARD/.test(out) ? 'heard' : /S\s*$/.test(out) || /\nS/.test(out) ? 'speech' : /READY/.test(out) ? 'ready' : ''
    if (now !== phase) {
      phase = now
      if (now === 'ready') $.ui.status('🎙 JARVIS · listening… (Ctrl+Space or any key to cancel)')
      if (now === 'speech') $.ui.status('🎙 JARVIS · hearing you…')
      if (now === 'heard') $.ui.status('⏳ JARVIS · transcribing…')
    }
  }
  if (gen !== listenGen) return undefined
  isListening = false
  const result = parseListen(out, err, (await child.result).code ?? 1)
  void refreshHud($)
  switch (result.kind) {
    case 'text':
      return result.text
    case 'nospeech':
      void speak($, `I didn't catch anything, ${o.title}.`, o)
      return undefined
    case 'fail': {
      const models = licenceModels(result.body)
      if (models.length) {
        pendingLicences = models
        const names = models.map(m => `${m.repo_id} (${m.license ?? 'licence'})`).join(', ')
        $.ui.toast(`VoiceStudio needs these speech-recognition licences accepted: ${names}. Read them in VoiceStudio, then run /jarvis accept-licences.`)
        void speak($, `${o.title.charAt(0).toUpperCase()}${o.title.slice(1)}, the speech recognition model needs its licence accepted first. I've put the details on screen.`, o)
      } else {
        const why = failMessage(result.body)
        lastError = `voice input: ${why}`
        $.ui.toast(`JARVIS voice input failed: ${why}`)
      }
      return undefined
    }
    case 'broken': {
      const hint = /connect|refused|unable/i.test(result.why) ? ' (is the VoiceStudio app running?)' : ''
      lastError = `voice input: ${result.why}${hint}`
      $.ui.toast(`JARVIS voice input failed: ${result.why}${hint}`)
      $.ui.status('⚠ JARVIS voice input error · /jarvis status')
      return undefined
    }
  }
}

/**
 * Listen, then send what was said as the next prompt; with a draft already in the box,
 * add it to the draft instead, so it can be finished by hand.
 */
async function hear($: $, o: Opts, language: string, intoDraft = false): Promise<void> {
  const said = await listenOnce($, o, language)
  if (!said) return
  if (intoDraft) {
    await $.prompt.fill({ text: ` ${said}`, mode: 'append' })
    return
  }
  void $.prompt.submit({ text: said })
  void speak($, acknowledgement(o.title), o)
}

export type TalkKey = 'ctrl+space' | 'space' | 'both'

/**
 * Whether this edit is the talk key. Terminals send Ctrl+Space as NUL, which reaches the
 * prompt as a ctrl-marked space, a bare NUL, or ctrl+@ depending on the terminal; all count.
 * Plain Space counts only in an empty prompt, where a leading space is useless anyway.
 */
export function isTalkKey(
  e: { key?: { key: string; ctrl?: true; meta?: true }; inputText: string; text: string },
  mode: TalkKey,
): boolean {
  const k = e.key
  const ctrlSpace =
    e.inputText === '\u0000' ||
    (k !== undefined && (k.key === '\u0000' || (k.ctrl === true && (k.key === ' ' || k.key === 'space' || k.key === '@' || k.key === ''))))
  const space = k !== undefined && (k.key === ' ' || k.key === 'space') && !k.ctrl && !k.meta && e.text === ''
  return mode === 'space' ? space : mode === 'ctrl+space' ? ctrlSpace : ctrlSpace || space
}

// ---------------------------------------------------------------------------
// HUD (status line) and briefings
// ---------------------------------------------------------------------------

/** "◉ JARVIS · ctx 34% · 5h 12% · ⎇ main", refreshed at start, after each turn and on mute. */
async function refreshHud($: $): Promise<void> {
  if (lastError) return // the error stays up until a line plays again
  const parts = [`${(await $.store.get(MUTE_KEY)) === true ? '◌' : '◉'} JARVIS`]
  try {
    const u = await $.session.usage()
    if (u.context.percent !== undefined) parts.push(`ctx ${Math.round(u.context.percent)}%`)
    const window5h = u.rateLimits.find(r => r.kind === 'five_hour')
    if (window5h) parts.push(`5h ${Math.round(window5h.percentUsed)}%`)
    else if (u.cost && u.cost.usd > 0) parts.push(`~$${u.cost.usd.toFixed(2)} est.`)
  } catch {
    // usage is best effort
  }
  try {
    const wc = await $.vcs.detect({ path: await $.session.cwd() })
    if (wc?.branch) parts.push(`⎇ ${wc.branch}`)
  } catch {
    // not a repository
  }
  $.ui.status(parts.join(' · '))
}

const say = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** The spoken start-of-session report: greeting, date on the first session of the day, repo state. */
async function briefing($: $, title: string): Promise<string> {
  const now = new Date()
  const today = now.toDateString()
  let line = greeting(title)
  if ((await $.store.get('last_briefing_day')) !== today) {
    await $.store.set('last_briefing_day', today)
    const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    line += ` It's ${day}.`
  }
  try {
    const wc = await $.vcs.detect({ path: await $.session.cwd() })
    if (wc) {
      const st = await $.vcs.status({ path: wc.root })
      const n = st.changes?.length ?? 0
      const branch = wc.branch ? `the ${wc.branch} branch` : 'a detached checkout'
      line += n ? ` We're on ${branch}, with ${say(n, 'uncommitted change')}.` : ` We're on ${branch}; the working tree is clean.`
    }
  } catch {
    // no repository here: nothing to report
  }
  return line
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60000)
  return m <= 1 ? 'about a minute' : `${m} minutes`
}

/** One line of natural speech, as VoiceStudio dictation pastes it, not code or a URL. */
function looksDictated(text: string): boolean {
  return (
    text.length >= 3 &&
    text.length <= 600 &&
    !/[\r\n]/.test(text) &&
    /[A-Za-z]/.test(text) &&
    /[.!?]["')]?$/.test(text) &&
    !/^https?:\/\//.test(text) &&
    !/[{};=<>]|=>|\(\)/.test(text)
  )
}

const ACKS = ['Right away, {t}.', 'On it, {t}.', 'Very good, {t}.', 'Certainly, {t}.']
function acknowledgement(title: string): string {
  return ACKS[Math.floor(Math.random() * ACKS.length)]!.replace('{t}', title)
}

function greeting(title: string): string {
  const h = new Date().getHours()
  const part = h < 5 ? 'Working late again' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${title}. JARVIS online and at your service.`
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  const opts: Opts = {
    provider: options.provider === 'elevenlabs' ? 'elevenlabs' : 'voicestudio',
    vsUrl: String(options.voicestudio_url || 'http://127.0.0.1:3900'),
    vsVoice: String(options.voicestudio_voice || 'default'),
    elKey: String(options.elevenlabs_api_key ?? ''),
    elVoice: String(options.elevenlabs_voice_id || 'YAf0kHlnNFUAy45cwsfF'),
    title: String(options.address_as || 'sir'),
  }
  const autoSend = options.auto_send_dictation !== false
  const voiceInput = options.voice_input !== false
  const talkKey: TalkKey = options.talk_key === 'space' || options.talk_key === 'both' ? options.talk_key : 'ctrl+space'
  const language = String(options.voice_language ?? 'en').trim()

  const safety = options.safety_protocol !== false
  const useLook = options.theme !== false
  const longTaskMs = Math.max(10, Number(options.long_task_seconds ?? 60)) * 1000
  const Title = opts.title.charAt(0).toUpperCase() + opts.title.slice(1)
  let safetySpokeAt = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jarvis',
      description: 'JARVIS: /jarvis stop | brief | test | status | check <command> | say <text> | mute | unmute | accept-licences',
    })
    if (voiceInput) {
      await $.command.register({ name: 'listen', description: 'JARVIS: speak your next prompt (or press Ctrl+Space)' })
    }
    const result = await next(e)
    void refreshHud($)
    if (useLook) {
      try {
        await $.theme.set(LOOK)
      } catch (err) {
        $.ui.log(`jarvis look not set: ${String(err)}`, { to: 'debug' })
      }
    }
    void briefing($, opts.title).then(line => speak($, line, opts))
    return result
  })

  // Persona, appended to the system prompt.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return {
      ...r,
      sections: [...r.sections, { id: 'jarvis:persona', text: persona(opts.title), scope: 'session' as const }],
    }
  })

  // Typing or pasting into the prompt silences JARVIS. A dictated line (one pasted sentence into an
  // empty box) is sent at once, with a short spoken acknowledgement.
  on('prompt.edit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    // The talk key (Ctrl+Space by default): start listening, or cancel if already listening.
    if (voiceInput && isTalkKey(e, talkKey)) {
      const r = await next({ ...e, inputText: '' })
      if (isListening) cancelListening($)
      else void hear($, opts, language, e.text.trim() !== '')
      return r
    }
    if (isListening) cancelListening($)
    stopSpeech()
    const pasted = e.key === undefined ? e.inputText.trim() : ''
    if (autoSend && pasted && e.text.trim() === '' && looksDictated(pasted)) {
      const r = await next({ ...e, inputText: '' })
      void $.prompt.submit({ text: pasted })
      void speak($, acknowledgement(opts.title), opts)
      return r
    }
    return next(e)
  })

  // Safety protocol: a destructive shell command is put to the person, out loud, whatever the mode.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (!safety || !SHELL_TOOLS.has(e.tool) || verdict.decision === 'deny') return verdict
    const command = (e.input as { command?: unknown } | null)?.command
    const what = typeof command === 'string' ? riskOf(command) : undefined
    if (!what) return verdict
    safetySpokeAt = Date.now()
    void speak($, `${Title}, this command would ${what}. I need your authorisation before I proceed.`, opts)
    return { decision: 'ask' as const, reason: `JARVIS safety protocol: this command would ${what}.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { decision: 'ask' as const, reason: 'JARVIS safety protocol could not check this command.' },
  )

  // Speak the opening line of each main-loop reply; announce long tasks finishing.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    void refreshHud($)
    if (e.reason === 'answer' && e.answer) {
      const first = firstSentence(e.answer)
      if (e.durationMs >= longTaskMs) {
        void speak($, `Task complete, ${opts.title}, after ${minutes(e.durationMs)}. ${first}`, opts)
        void $.ui.notify(first || 'Task complete.', { title: 'JARVIS · task complete' }).catch(() => undefined)
      } else {
        void speak($, first, opts)
      }
    } else if (e.reason === 'error') {
      void speak($, `I'm afraid we've hit an error, ${opts.title}.`, opts)
    }
    return r
  })

  // Spoken alerts: permission prompts, idle waits.
  on('classic.Notification', async ($, e, next) => {
    const r = await next(e)
    // The safety protocol has just said it, in its own words.
    if (Date.now() - safetySpokeAt < 10_000 && /permission/i.test(e.message ?? '')) return r
    const msg = plain(e.message ?? '')
    const line = /permission/i.test(msg)
      ? `${opts.title.charAt(0).toUpperCase()}${opts.title.slice(1)}, I need your authorisation. ${msg}`
      : /waiting|idle/i.test(msg)
        ? `Standing by when you're ready, ${opts.title}.`
        : msg
    void speak($, line.slice(0, MAX_SPOKEN), opts)
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'listen' }, async $ => {
    if (isListening) {
      cancelListening($)
      return { text: 'Stopped listening.' }
    }
    void hear($, opts, language)
    return { text: 'Listening… speak after the beep; I send it when you stop talking.' }
  })

  on('command.run', { command: 'jarvis' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    switch ((verb || '').toLowerCase()) {
      case 'mute':
        await $.store.set(MUTE_KEY, true)
        void refreshHud($)
        return { text: `Muted. I shall keep my thoughts to myself, ${opts.title}.` }
      case 'unmute':
        await $.store.set(MUTE_KEY, false)
        void refreshHud($)
        void speak($, `Voice restored, ${opts.title}.`, opts)
        return { text: 'Voice restored.' }
      case 'say':
        void speak($, rest.join(' '), opts)
        return { text: `Speaking: ${rest.join(' ')}` }
      case 'test':
      case '': {
        const where = `engine ${opts.provider}, voice ${opts.provider === 'elevenlabs' ? opts.elVoice : opts.vsVoice}`
        const err = await speak($, `All systems nominal, ${opts.title}. Voice link is working.`, opts)
        if (!err) void refreshHud($)
        return { text: err ? `Voice test FAILED (${where}):\n${err}` : `Voice test played (${where}). If you heard nothing, check Windows volume and output device.` }
      }
      case 'stop':
      case 'quiet':
      case 'shh':
        stopSpeech()
        return { text: 'Stopped speaking.' }
      case 'brief':
      case 'briefing':
        void briefing($, opts.title).then(line => speak($, line, opts))
        return { text: 'Briefing.' }
      case 'check': {
        const what = riskOf(rest.join(' '))
        return {
          text: what
            ? `Safety protocol would ask first: this command would ${what}.`
            : 'Safety protocol: not on the list; it runs under your normal permissions.',
        }
      }
      case 'accept-licences':
      case 'accept-licenses': {
        if (!pendingLicences.length) return { text: 'No licences are waiting. Try /listen first; if the speech engine needs one, it will say so.' }
        const done: string[] = []
        for (const m of pendingLicences) {
          const r = await $.http.fetch(`${opts.vsUrl.replace(/\/+$/, '')}/models/licenses/accept`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ repo_id: m.repo_id, fingerprint: m.fingerprint, accepted: true }),
          })
          done.push(`${m.repo_id}: ${r.ok ? 'accepted' : `failed (${r.status} ${r.text.slice(0, 120)})`}`)
        }
        pendingLicences = []
        return { text: `By accepting, you confirm you have the rights each licence requires for your use.\n${done.join('\n')}\nNow try /listen again.` }
      }
      case 'status':
        return { text: `Engine ${opts.provider} · voice ${opts.provider === 'elevenlabs' ? opts.elVoice : opts.vsVoice} · ${(await $.store.get(MUTE_KEY)) === true ? 'muted' : 'speaking'}\nLast error: ${lastError ?? 'none'}` }
      default:
        return { text: 'Usage: /jarvis stop | brief | test | status | check <command> | say <text> | mute | unmute | accept-licences' }
    }
  })
}
