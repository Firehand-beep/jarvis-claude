import type { EngineInterface, Register } from 'claude-code'

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
function speechRequest(text: string, o: Opts) {
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
      response_format: 'wav',
    }),
    header: undefined,
    ext: 'wav',
  }
}

// Windows: PowerShell downloads the clip and plays it (WAV via SoundPlayer, MP3 via MediaPlayer).
// Everything arrives through environment variables, never the command line.
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$f = Join-Path $env:TEMP ('jarvis-' + [guid]::NewGuid().ToString() + '.' + $env:JARVIS_EXT)
$h = @{}
if ($env:JARVIS_HDR_NAME) { $h[$env:JARVIS_HDR_NAME] = $env:JARVIS_HDR_VALUE }
$body = [Text.Encoding]::UTF8.GetBytes($env:JARVIS_BODY)
Invoke-WebRequest -UseBasicParsing -Method Post -Uri $env:JARVIS_URL -Headers $h -ContentType 'application/json' -Body $body -OutFile $f -TimeoutSec 90
try {
  if ($env:JARVIS_EXT -eq 'wav') {
    (New-Object System.Media.SoundPlayer $f).PlaySync()
  } else {
    Add-Type -AssemblyName PresentationCore
    $p = New-Object System.Windows.Media.MediaPlayer
    $p.Open([Uri]$f)
    Start-Sleep -Milliseconds 300
    $p.Play()
    Start-Sleep -Milliseconds ([int]((Get-Item $f).Length * 8 / 128) + 400)
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

/** PowerShell's -EncodedCommand: base64 of the script as UTF-16LE (no Node/DOM here). */
function encodePowerShell(script: string): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes.push(c & 0xff, c >> 8)
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i] ?? 0, bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += A.charAt((n >> 18) & 63) + A.charAt((n >> 12) & 63)
    out += b === undefined ? '=' : A.charAt((n >> 6) & 63)
    out += c === undefined ? '=' : A.charAt(n & 63)
  }
  return out
}
const PS_ENCODED = encodePowerShell(PS_SCRIPT)

let queue: Promise<unknown> = Promise.resolve()
let lastError: string | undefined
let isWindows: boolean | undefined

async function synthesizeAndPlay($: $, text: string, o: Opts) {
  if (isWindows === undefined) isWindows = (await $.session.machine()).sysname === 'Windows_NT'
  const req = speechRequest(text, o)
  const env: Record<string, string> = {
    JARVIS_URL: req.url,
    JARVIS_BODY: req.body,
    JARVIS_EXT: req.ext,
    JARVIS_HDR_NAME: req.header?.[0] ?? '',
    JARVIS_HDR_VALUE: req.header?.[1] ?? '',
  }
  const argv = isWindows
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', PS_ENCODED]
    : ['sh', '-s']
  const r = await $.process.run(argv, isWindows ? { env, timeoutMs: 150_000 } : { stdin: SH_SCRIPT, env, timeoutMs: 150_000 })
  if (r.exitCode !== 0) {
    const why = r.stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ') || `exit ${r.exitCode}`
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
  const run = queue.then(async () => {
    if ((await $.store.get(MUTE_KEY)) === true) return undefined
    try {
      await synthesizeAndPlay($, line, opts)
      lastError = undefined
      return undefined
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      $.ui.toast(`JARVIS voice failed: ${lastError}`)
      $.ui.status('⚠ JARVIS voice error: /jarvis status')
      return lastError
    }
  })
  queue = run
  return run
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

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jarvis',
      description: 'JARVIS voice: /jarvis test | status | say <text> | mute | unmute',
    })
    const result = await next(e)
    $.ui.status('◉ JARVIS')
    void speak($, greeting(opts.title), opts)
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

  // Speak the opening line of each main-loop reply.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && e.answer) {
      void speak($, firstSentence(e.answer), opts)
    } else if (e.agentId === undefined && e.reason === 'error') {
      void speak($, `I'm afraid we've hit an error, ${opts.title}.`, opts)
    }
    return r
  })

  // Spoken alerts: permission prompts, idle waits.
  on('classic.Notification', async ($, e, next) => {
    const r = await next(e)
    const msg = plain(e.message ?? '')
    const line = /permission/i.test(msg)
      ? `${opts.title.charAt(0).toUpperCase()}${opts.title.slice(1)}, I need your authorisation. ${msg}`
      : /waiting|idle/i.test(msg)
        ? `Standing by when you're ready, ${opts.title}.`
        : msg
    void speak($, line.slice(0, MAX_SPOKEN), opts)
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'jarvis' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    switch ((verb || '').toLowerCase()) {
      case 'mute':
        await $.store.set(MUTE_KEY, true)
        $.ui.status('◌ JARVIS (muted)')
        return { text: `Muted. I shall keep my thoughts to myself, ${opts.title}.` }
      case 'unmute':
        await $.store.set(MUTE_KEY, false)
        $.ui.status('◉ JARVIS')
        void speak($, `Voice restored, ${opts.title}.`, opts)
        return { text: 'Voice restored.' }
      case 'say':
        void speak($, rest.join(' '), opts)
        return { text: `Speaking: ${rest.join(' ')}` }
      case 'test':
      case '': {
        const where = `engine ${opts.provider}, voice ${opts.provider === 'elevenlabs' ? opts.elVoice : opts.vsVoice}`
        const err = await speak($, `All systems nominal, ${opts.title}. Voice link is working.`, opts)
        if (!err) $.ui.status('◉ JARVIS')
        return { text: err ? `Voice test FAILED (${where}):\n${err}` : `Voice test played (${where}). If you heard nothing, check Windows volume and output device.` }
      }
      case 'status':
        return { text: `Engine ${opts.provider} · voice ${opts.provider === 'elevenlabs' ? opts.elVoice : opts.vsVoice} · ${(await $.store.get(MUTE_KEY)) === true ? 'muted' : 'speaking'}\nLast error: ${lastError ?? 'none'}` }
      default:
        return { text: 'Usage: /jarvis test | status | say <text> | mute | unmute' }
    }
  })
}
