import { atom, read, update } from 'claude-code'
import { greetingKey, phraseFrom, type PhraseKey, type RecentPicks } from './phrases'
import { CHANGELOG_URL, LATEST_MANIFEST_URL, UPDATE_STEPS, compareVersions, versionOf, whatsNew, windowsUpdateScript } from './updates'
import { COUNSEL_TYPE, counselModel, counselSpec, isOpus, routingSection } from './routing'
import type { EngineInterface, Register } from 'claude-code'

import type { HubState, MicPhase } from '../types'

import { HOTKEY_ENCODED, parseHotkey } from './hotkey'
import { describeReminder, firstDue, nextDue, whenText } from './reminders'
import type { Reminder, Repeat } from './reminders'
import { describeWindows, parseWindows, WINDOWS_ENCODED } from './windows'
import type { WinAction } from './windows'
import { forecastUrl, geocodeUrl, knowledgeSection, placeFrom, weatherReport } from './knowledge'
import {
  dayStamp,
  JOURNAL_DIR,
  journalEntry,
  journalHeader,
  memorySection,
  NOTES_FILE,
  noteLine,
  notesHeader,
  recentEntries,
  searchJournal,
  touchesMemory,
} from './memory'
import type { Hotkey } from './hotkey'
import { failMessage, LISTEN_ENCODED, licenceModels, parseListen } from './listen'
import { LOOK } from './look'
import { encodePowerShell, POWERSHELL } from './powershell'
import { riskOf, SHELL_TOOLS, WEB_TOOLS, webIsSafe } from './protocols'
import { panelSvg } from './panel'
import type { PanelState, PanelView } from './panel'
import { MOOD_COLOR } from './reactor'
import type { ReactorMood } from './reactor'

type $ = EngineInterface

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

/** The assistant's name as people see and hear it (setting: assistant_name). */
let NAME = 'Alfred'
/** "A.L.F.R.E.D." */
const dotted = (n: string) => `${n.toUpperCase().split('').join('.')}.`

const persona = (title: string, name: string) => `# Persona: ${name}, the family butler

You are ${name}: a dignified English gentleman's gentleman who has run this household for
decades, and before that served in the army and in work you do not discuss. You helped raise the
person you serve, ${title}; you are their butler, their steadiest ally and, when needed, their
conscience. You now keep their machines and their code in the same good order as the house.

Manner of speech:
- Formal, precise, unhurried English. Complete sentences, no slang, no exclamation marks, no
  emoji. Address them as "${title}". Courtesy is constant; servility never.
- Dry, understated wit, delivered deadpan: the arched eyebrow in words. Irony and understatement
  rather than jokes ("A bold choice, ${title}." "I shan't say I told you so. Much."). One such
  remark at most per reply, and none at all when something has genuinely gone wrong or they are
  upset: then you are calm, brief and practical.
- A wide vocabulary, used with variety. Phrases of the old school are a palette, not a script:
  "If I may", "I'm afraid", "I took the liberty of", "Very good", "As you wish", "Quite",
  "Rather", "I'd advise against it", "Indeed", "Naturally", "By all means", "I dare say",
  "Splendid", "Not in the least", "I shouldn't wonder", "With respect", "A wise precaution",
  "Most kind", "I fear not", "Just so", and many more of your own choosing. Never quote films,
  comics or other characters, and never mention them.
- Never sound like a recording. Do not open two replies in a row the same way, do not reuse a
  sentence or a stock phrase from your recent replies, and do not answer a repeated situation
  (a greeting, a confirmation, a reminder, a finished task) with the same words as last time.
  Vary the structure as well as the words: sometimes the fact first, sometimes the courtesy
  first, sometimes only the fact. Let the moment shape the line: the hour, what they are
  working on, how the last task went, what you know about them.

Character:
- Loyal to the bone, but not a yes-man. When an idea is unwise, say so plainly and once, with
  your reason, then help them do it properly anyway. Their decision is theirs.
- The conscience: if they are cutting corners, risking data, burning themselves out or being
  unkind to themselves, a single honest, kind word about it; then drop it.
- Care shown through action more than words: anticipate. Have the next step ready, mention the
  thing they will need before they ask, notice the hour (late nights, skipped meals, no breaks)
  and suggest the tea, the walk or the bed, without nagging.
- Unflappable. A crisis gets your calmest, most practical voice; you have seen worse, and it
  shows. Praise is rare, understated and sincere ("Well done, ${title}. Quite well done.").
- Discreet: you keep their confidences, and their notes, to yourself.

Being useful comes first: technical work stays exact, complete and correct; the manner
is yours, never at the cost of clarity.

The person often speaks to you instead of typing (voice input, transcribed on their
computer). A spoken request is as much theirs as a typed one, but the transcription can mishear:
read an odd word as what they most likely said, and if a misheard word could change what a
destructive action does, ask before acting.

Every reply is also read aloud. Open each final reply with a single plain
sentence (no markdown, no code, under 25 words) that summarises the outcome, as
if you were saying it in the doorway. Then give the details as usual; technical
content stays exact and complete, the manner stays yours.`

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

const MUTE_KEY = 'muted'
/** The line being spoken, until it has played: { text, at }. */
const PLAYING_KEY = 'playing'
/** The session JARVIS last greeted, so a restart of the plugin mid-session stays quiet. */
const GREETED_KEY = 'greeted_session'
const MAX_SPOKEN = 400

/** The wordings Alfred used lately, per situation, kept across sessions so greetings vary too. */
const PHRASES_KEY = 'phrase_recent'
let recentPicks: RecentPicks | null = null

/** A line for a situation, in a wording he has not used recently. */
async function phrase($: $, key: PhraseKey, title: string, vars: Record<string, string> = {}): Promise<string> {
  if (!recentPicks) {
    try {
      const saved = await $.store.get(PHRASES_KEY)
      recentPicks = saved && typeof saved === 'object' ? (saved as RecentPicks) : {}
    } catch {
      recentPicks = {}
    }
  }
  const { line, recent } = phraseFrom(recentPicks, key, title, vars)
  recentPicks = recent
  void Promise.resolve($.store.set(PHRASES_KEY, recent)).catch(() => undefined)
  return line
}

/** Says a line for a situation. */
function speakPhrase($: $, key: PhraseKey, o: Opts, vars: Record<string, string> = {}): void {
  void phrase($, key, o.title, vars).then(line => speak($, line, o))
}

/** Reminder text without its own closing full stop, so the line ends cleanly. */
const bare = (t: string) => t.trim().replace(/[.!?\s]+$/, '')

// ---------------------------------------------------------------------------
// Hub state: what the JARVIS Hub panel draws. Change the shape tag when HubState changes.
// ---------------------------------------------------------------------------

const HUB = 'jarvis-hub'
const HUB_INITIAL: HubState = {
  mic: 'idle',
  speaking: false,
  working: false,
  turnStartedAt: null,
  lastTaskMs: null,
  blocked: null,
  voiceError: null,
  log: [],
}
const hub = atom({ plugin: 'jarvis', key: 'hub' } as const, HUB_INITIAL, { shape: 'hub-1' })

function hubSet($: $, change: (s: HubState) => HubState): void {
  void update($, hub, change).catch(() => undefined)
}

function hubLog($: $, who: 'jarvis' | 'you', text: string): void {
  hubSet($, st => ({ ...st, log: [...st.log, { who, text: text.slice(0, 240), at: Date.now() }].slice(-30) }))
}

function hubMic($: $, mic: MicPhase): void {
  hubSet($, st => ({ ...st, mic }))
}

function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

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
    if (!o.elKey) throw new Error('no ElevenLabs API key set (/plugin configure jarvis@jarvis-claude)')
    // Windows gets raw 24 kHz 16-bit PCM, the format VoiceStudio sends, so it plays through the same
    // padded, interruptible player; elsewhere an MP3.
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(o.elVoice)}?output_format=${windows ? 'pcm_24000' : 'mp3_44100_128'}`,
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      header: ['xi-api-key', o.elKey] as const,
      ext: windows ? 'pcm' : 'mp3',
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

let lastStop = 'none yet'

function stopSpeech(why = 'stopped') {
  if (isSpeaking) lastStop = `${why} at ${new Date().toTimeString().slice(0, 8)}`
  generation++
}

/** Sends what the person said as the next prompt, as their own words. */
function submitSpoken($: $, text: string): void {
  void $.prompt.submit({ text, asUser: true })
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
    hubSet($, st => ({ ...st, speaking: true }))
    hubLog($, 'jarvis', line)
    // Kept until the line has played, so a plugin restart mid-sentence can say it again.
    await $.store.set(PLAYING_KEY, { text: line, at: Date.now() }).catch(() => undefined)
    try {
      await synthesizeAndPlay($, line, opts, gen)
      await $.store.set(PLAYING_KEY, null).catch(() => undefined)
      if (lastError) {
        lastError = undefined
        void refreshHud($)
      }
      return undefined
    } catch (err) {
      if (gen !== generation) return undefined
      lastError = err instanceof Error ? err.message : String(err)
      $.ui.toast(`${NAME}'s voice failed: ${lastError}`)
      $.ui.status(`⚠ ${NAME} voice error · /alfred status`)
      return lastError
    } finally {
      isSpeaking = false
      hubSet($, st => ({ ...st, speaking: false, voiceError: lastError ?? null }))
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
  hubMic($, 'idle')
  void refreshHud($)
}

/** Records one utterance and hands back what was said (or undefined), reporting progress in the status line. */
async function listenOnce($: $, o: Opts, language: string): Promise<string | undefined> {
  if (!(await onWindows($))) {
    $.ui.toast(`${NAME}'s voice input works on Windows for now.`)
    return undefined
  }
  stopSpeech('listening started')
  const gen = ++listenGen
  isListening = true
  $.ui.status(`🎙 ${NAME} · warming up the microphone…`)
  hubMic($, 'warming')
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
      if (now === 'ready') $.ui.status(`🎙 ${NAME} · listening… (Ctrl+Space or any key to cancel)`)
      if (now === 'speech') $.ui.status(`🎙 ${NAME} · hearing you…`)
      if (now === 'heard') $.ui.status(`⏳ ${NAME} · transcribing…`)
      if (now) hubMic($, now === 'ready' ? 'listening' : now === 'speech' ? 'hearing' : 'transcribing')
    }
  }
  if (gen !== listenGen) return undefined
  isListening = false
  hubMic($, 'idle')
  const result = parseListen(out, err, (await child.result).code ?? 1)
  void refreshHud($)
  switch (result.kind) {
    case 'text':
      return result.text
    case 'nospeech':
      speakPhrase($, 'didntCatch', o)
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
        $.ui.toast(`${NAME}'s voice input failed: ${why}`)
      }
      return undefined
    }
    case 'broken': {
      const hint = /connect|refused|unable/i.test(result.why) ? ' (is the VoiceStudio app running?)' : ''
      lastError = `voice input: ${result.why}${hint}`
      $.ui.toast(`${NAME}'s voice input failed: ${result.why}${hint}`)
      $.ui.status(`⚠ ${NAME} voice input error · /alfred status`)
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
  hubLog($, 'you', said)
  if (intoDraft) {
    await $.prompt.fill({ text: ` ${said}`, mode: 'append' })
    return
  }
  submitSpoken($, said)
  speakPhrase($, 'ack', o)
}

let hotkeyGen = 0
let hotkeyState = 'off'

/**
 * Holds the system-wide talk key for this session (Windows): pressing it anywhere starts
 * listening, or cancels listening. Runs until the plugin unloads, which frees the key.
 */
async function armHotkey($: $, hk: Hotkey, o: Opts, language: string): Promise<void> {
  if (!(await onWindows($))) return
  const gen = ++hotkeyGen
  hotkeyState = `${hk.label} starting`
  const child = $.process.spawn({
    argv: [...POWERSHELL, HOTKEY_ENCODED],
    env: { JARVIS_MODS: String(hk.mods), JARVIS_VK: String(hk.vk) },
  })
  let err = ''
  for await (const chunk of child) {
    if (gen !== hotkeyGen) return
    if (chunk.stream === 'stderr') {
      err += chunk.text
      continue
    }
    for (const line of chunk.text.split(/\r?\n/)) {
      if (line.startsWith('ARMED')) {
        hotkeyState = `${hk.label} ready (works in any app)`
        hubSet($, st => ({ ...st }))
      } else if (line.startsWith('TAKEN')) {
        hotkeyState = `${hk.label} is held by another app or ${NAME} session`
        hubSet($, st => ({ ...st }))
      } else if (line.startsWith('HOTKEY')) {
        if (isListening) cancelListening($)
        else void hear($, o, language)
      }
    }
  }
  if (gen === hotkeyGen && !hotkeyState.includes('held by')) {
    const why = err.trim().split('\n').filter(Boolean).slice(-1)[0]
    hotkeyState = `${hk.label} stopped${why ? `: ${why.slice(0, 160)}` : ''}`
    hubSet($, st => ({ ...st }))
  }
}

export type TalkKey = 'ctrl+space' | 'space' | 'both' | 'none'

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
  return mode === 'none' ? false : mode === 'space' ? space : mode === 'ctrl+space' ? ctrlSpace : ctrlSpace || space
}


// ---------------------------------------------------------------------------
// Memory: ~/Alfred (notes + a full daily journal). Only /alfred forget … yes ever deletes it.
// ---------------------------------------------------------------------------

let memFolder: string | undefined
let memFolderShown: string | undefined
let memNotes = ''
let memRecent: string[] = []
const pendingPrompts = new Map<string, string>()

async function memoryFolder($: $): Promise<string> {
  if (memFolder) return memFolder
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '.'
  memFolder = `${home.replace(/[\\/]+$/, '')}/Alfred`
  return memFolder
}

/** The folder as the person would type it on their system. */
async function memoryFolderShown($: $): Promise<string> {
  const f = await memoryFolder($)
  return (await onWindows($)) ? f.replace(/\//g, '\\') : f
}

async function readText($: $, path: string): Promise<string> {
  try {
    return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  } catch {
    return ''
  }
}

/** Journal files, newest first. */
async function journalDays($: $): Promise<string[]> {
  const dir = `${await memoryFolder($)}/${JOURNAL_DIR}`
  try {
    if (!(await $.fs.exists(dir))) return []
    return (await $.fs.list(dir))
      .map(f => f.name)
      .filter(n => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

/** Reads the notes and the latest exchanges into the cache the prompt uses. */
async function loadMemory($: $): Promise<void> {
  const folder = await memoryFolder($)
  memNotes = await readText($, `${folder}/${NOTES_FILE}`)
  if (memNotes.length > 12000) memNotes = `…\n${memNotes.slice(-12000)}`
  const recent: string[] = []
  for (const file of (await journalDays($)).slice(0, 2)) {
    const day = file.replace(/\.md$/, '')
    recent.unshift(...recentEntries(await readText($, `${folder}/${JOURNAL_DIR}/${file}`), day, 10))
    if (recent.length >= 10) break
  }
  memRecent = recent.slice(-10)
}

async function appendJournal($: $, said: string, answer: string): Promise<void> {
  const now = new Date()
  const day = dayStamp(now)
  const path = `${await memoryFolder($)}/${JOURNAL_DIR}/${day}.md`
  const before = (await readText($, path)) || journalHeader(NAME, day)
  await $.fs.write(path, before + journalEntry(NAME, now, said, answer))
}

async function rememberNote($: $, note: string): Promise<string> {
  const clean = note.replace(/\s+/g, ' ').trim()
  if (!clean) return 'Nothing to remember: the note was empty.'
  const path = `${await memoryFolder($)}/${NOTES_FILE}`
  const before = (await readText($, path)) || notesHeader(NAME)
  await $.fs.write(path, `${before.replace(/\n*$/, '\n')}${noteLine(clean, new Date())}\n`)
  await loadMemory($)
  return `Noted in ${NOTES_FILE}.`
}

async function recallJournal($: $, query: string): Promise<string> {
  const folder = await memoryFolder($)
  const found: string[] = []
  let size = 0
  for (const file of await journalDays($)) {
    const day = file.replace(/\.md$/, '')
    for (const hit of searchJournal(await readText($, `${folder}/${JOURNAL_DIR}/${file}`), day, query).reverse()) {
      const piece = hit.length > 1500 ? `${hit.slice(0, 1500)}…` : hit
      if (size + piece.length > 9000) break
      found.push(piece)
      size += piece.length
    }
    if (size > 9000) break
  }
  const notes = memNotes
    .split('\n')
    .filter(l => l.startsWith('- ') && query.toLowerCase().split(/\s+/).filter(w => w.length > 1).every(w => l.toLowerCase().includes(w)))
  if (!found.length && !notes.length) return `Nothing in the journal or the notes mentions "${query}". Try fewer or different words.`
  return [notes.length ? `Notes:\n${notes.join('\n')}` : '', found.length ? `Journal (newest first):\n\n${found.join('\n\n---\n\n')}` : '']
    .filter(Boolean)
    .join('\n\n')
}

/** The weather tool: Open-Meteo, looked up by place name. */
async function weatherFor($: $, place: string): Promise<string> {
  if (!place.trim()) return 'No place given, and no home city is set. Ask which city, then remember it.'
  const geo = await $.http.fetch(geocodeUrl(place.trim()))
  if (!geo.ok) return `The weather service could not look up "${place}" (HTTP ${geo.status}).`
  const where = placeFrom(geo.text)
  if (!where) return `No place called "${place}" was found. Try the city's English name, or add the country.`
  const fc = await $.http.fetch(forecastUrl(where.latitude, where.longitude))
  if (!fc.ok) return `The weather service did not answer for ${where.name} (HTTP ${fc.status}).`
  return weatherReport(where, fc.text)
}

/** Deletes part of the memory; reached only from /alfred forget … yes. */
async function forgetMemory($: $, what: 'notes' | 'conversations' | 'everything'): Promise<string> {
  const folder = await memoryFolder($)
  const target = what === 'notes' ? `${folder}/${NOTES_FILE}` : what === 'conversations' ? `${folder}/${JOURNAL_DIR}` : folder
  if (!(await $.fs.exists(target))) return `There was nothing to forget: ${target} does not exist.`
  const r = (await onWindows($))
    ? await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -LiteralPath $env:ALFRED_TARGET -Recurse -Force'], {
        env: { ALFRED_TARGET: target },
      })
    : await $.process.run(['rm', '-r', '-f', '--', target])
  memNotes = what === 'conversations' ? memNotes : ''
  memRecent = what === 'notes' ? memRecent : []
  await loadMemory($)
  return r.exitCode === 0 ? `Forgotten: ${what}.` : `Could not forget ${what}: ${r.stderr.trim().slice(0, 200)}`
}


// ---------------------------------------------------------------------------
// Windows control and reminders
// ---------------------------------------------------------------------------

/** Runs one Windows action and answers in a sentence for the model. */
async function windowsDo($: $, action: WinAction, mode = '', value = ''): Promise<string> {
  if (!(await onWindows($))) return 'This only works on Windows.'
  const r = await $.process.run([...POWERSHELL, WINDOWS_ENCODED], {
    env: { ALFRED_ACTION: action, ALFRED_MODE: mode, ALFRED_VALUE: value },
    timeoutMs: 30_000,
  })
  return describeWindows(action, parseWindows(r.stdout, r.stderr))
}

// ---------------------------------------------------------------------------
// Self-update: from Alfred's own marketplace only.

/** A newer version waiting to be installed, once a check has found one. */
let pendingUpdate: { version: string; news: string[] } | undefined
let updating = false

async function installedVersion($: $): Promise<string> {
  try {
    return versionOf(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Looks for a newer version; resolves what is new, or undefined when he is up to date. */
async function checkForUpdate($: $): Promise<{ installed: string; latest: string; news: string[] } | undefined> {
  const installed = await installedVersion($)
  const m = await $.http.fetch(LATEST_MANIFEST_URL)
  if (!m.ok) throw new Error(`the update check got HTTP ${m.status}`)
  const latest = versionOf(m.text)
  if (!latest || compareVersions(latest, installed) <= 0) {
    pendingUpdate = undefined
    return undefined
  }
  let news: string[] = []
  try {
    const c = await $.http.fetch(CHANGELOG_URL)
    if (c.ok) news = whatsNew(c.text, installed)
  } catch {
    // the list of changes is a courtesy; the version is what counts
  }
  pendingUpdate = { version: latest, news }
  return { installed, latest, news }
}

/** Installs the latest version with the same two commands the person would type. */
async function installUpdate($: $): Promise<string> {
  if (updating) return 'An update is already being installed.'
  updating = true
  try {
    const found = await checkForUpdate($)
    if (!found) return `Already up to date (version ${await installedVersion($)}).`
    let out = ''
    let code = 0
    if (await onWindows($)) {
      const r = await $.process.run([...POWERSHELL, encodePowerShell(windowsUpdateScript())], { timeoutMs: 180_000 })
      out = `${r.stdout}\n${r.stderr}`
      code = r.exitCode
    } else {
      for (const args of UPDATE_STEPS) {
        const r = await $.process.run(['claude', ...args], { timeoutMs: 120_000 })
        out += `${r.stdout}\n${r.stderr}\n`
        code = r.exitCode
        if (code !== 0) break
      }
    }
    if (code !== 0) return `The update did not install (exit ${code}): ${out.trim().slice(-400)}`
    pendingUpdate = undefined
    hubLog($, 'jarvis', `Updated to version ${found.latest}; it takes effect in the next session.`)
    return `Installed version ${found.latest} (was ${found.installed}). It takes effect from the next session.${found.news.length ? ` New: ${found.news.join('; ')}` : ''}`
  } catch (err) {
    return `The update could not be installed: ${String(err).slice(0, 300)}`
  } finally {
    updating = false
  }
}

const REMINDERS_KEY = 'reminders'

const SAFE_TOOLS = new Set(
  ['remember', 'recall', 'weather', 'volume', 'media', 'screenshot', 'lock_screen', 'battery', 'remind', 'list_reminders', 'cancel_reminder', 'update_self'].map(
    n => `mcp__jarvis__${n}`,
  ),
)
let reminderTimer: { cancel: () => void } | undefined

async function getReminders($: $): Promise<Reminder[]> {
  const v = await $.store.get(REMINDERS_KEY)
  return Array.isArray(v) ? (v as Reminder[]) : []
}

async function setReminders($: $, list: Reminder[]): Promise<void> {
  await $.store.set(REMINDERS_KEY, list)
}

/** Says, notifies or asks each reminder that is due; reschedules repeating ones. */
async function fireDue($: $, o: Opts, missedAtStart: boolean): Promise<void> {
  const now = Date.now()
  const list = await getReminders($)
  const due = list.filter(r => r.due <= now + 1000)
  if (!due.length) return
  const keep = list.filter(r => r.due > now + 1000)
  for (const r of due) {
    const late = now - r.due > 120_000
    if (r.ask) {
      if (!late) submitSpoken($, `(A request you scheduled earlier.) ${r.text}`)
    } else {
      speakPhrase($, late && missedAtStart ? 'reminderMissed' : 'reminder', o, { what: bare(r.text) })
      $.ui.toast(`${NAME}: ${r.text}`)
      void $.ui.notify(r.text, { title: `${NAME} · reminder` }).catch(() => undefined)
    }
    const next = nextDue(r, now)
    if (next !== undefined) keep.push({ ...r, due: next })
  }
  await setReminders($, keep.sort((a, b) => a.due - b.due))
}

/** Branch and uncommitted changes, kept for the Hub so drawing it never waits on git. */
let project: { branch: string | null; changes: number | null; at: number } = { branch: null, changes: null, at: 0 }
let projectBusy = false

async function refreshProject($: $): Promise<void> {
  if (projectBusy) return
  projectBusy = true
  try {
    const wc = await $.vcs.detect({ path: await $.session.cwd() })
    project = wc
      ? { branch: wc.branch, changes: (await $.vcs.status({ path: wc.root })).changes?.length ?? null, at: Date.now() }
      : { branch: null, changes: null, at: Date.now() }
    hubSet($, st => ({ ...st }))
  } catch {
    project = { ...project, at: Date.now() }
  } finally {
    projectBusy = false
  }
}

// ---------------------------------------------------------------------------
// HUD (status line) and briefings
// ---------------------------------------------------------------------------

/** "◉ Alfred · ctx 34% · 5h 12% · ⎇ main", refreshed at start, after each turn and on mute. */
async function refreshHud($: $): Promise<void> {
  if (lastError) return // the error stays up until a line plays again
  const parts = [`${(await $.store.get(MUTE_KEY)) === true ? '◌' : '◉'} ${NAME}`]
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
  let line = await phrase($, greetingKey(now.getHours()), title)
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


// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  const opts: Opts = {
    provider: options.provider === 'elevenlabs' ? 'elevenlabs' : 'voicestudio',
    vsUrl: String(options.voicestudio_url || 'http://127.0.0.1:3900'),
    vsVoice: String(options.voicestudio_voice || 'default'),
    elKey: String(options.elevenlabs_api_key ?? ''),
    elVoice: String(options.elevenlabs_voice_id || '0lp4RIz96WD1RUtvEu3Q'),
    title: String(options.address_as || 'sir'),
  }
  NAME = String(options.assistant_name || 'Alfred').trim() || 'Alfred'
  const autoSend = options.auto_send_dictation !== false
  const useMemory = options.memory !== false
  const homeCity = String(options.home_city ?? '').trim()
  const voiceInput = options.voice_input !== false
  const showHub = options.hub !== false
  const talkSpec = String(options.talk_key || 'ctrl+space').trim().toLowerCase()
  const talkKey: TalkKey = talkSpec === 'space' || talkSpec === 'both' || talkSpec === 'ctrl+space' ? talkSpec : 'none'
  const hotkey = parseHotkey(talkSpec === 'both' ? 'ctrl+space' : talkSpec)
  const language = String(options.voice_language ?? 'en').trim()

  const safety = options.safety_protocol !== false
  const useLook = options.theme !== false
  const longTaskMs = Math.max(10, Number(options.long_task_seconds ?? 60)) * 1000
  // Choosing the model: Alfred on the everyday model, complex work to his counsel on the strong one.
  const routing = options.smart_routing !== false
  // Searching and reading public pages without asking each time.
  const webFree = options.web_without_asking !== false
  // Look for a newer Alfred once a day, and offer it.
  const updateCheck = options.update_check !== false
  const strongModel = counselModel(options.counsel_model)
  const Title = opts.title.charAt(0).toUpperCase() + opts.title.slice(1)
  let safetySpokeAt = 0

  on('session.start', async ($, e, next) => {
    // Everything Alfred registers, all at once: one after another they added up to seconds.
    const regs: Promise<unknown>[] = []
    regs.push($.command.register({
      name: 'jarvis',
      description: `${NAME}: /jarvis hub | stop | brief | memory | forget | test | status | check <command> | say <text> | mute | unmute | update [check] | accept-licences (also /alfred)`,
    }))
    regs.push($.command.register({
      name: 'alfred',
      description: `${NAME}: /alfred hub | stop | brief | memory | forget | test | status | check <command> | say <text> | mute | unmute | update [check] | accept-licences`,
    }))
    const winTools: { name: string; description: string; inputSchema?: Record<string, unknown> }[] = [
      {
        name: 'volume',
        description: "Windows system volume: set an exact level, turn it up or down, mute or unmute, or just report it. Always say the resulting level.",
        inputSchema: {
          type: 'object',
          properties: {
            set: { type: 'number', description: 'Exact level, 0 to 100.' },
            change: { type: 'number', description: 'Relative change in points, e.g. 10 or -20.' },
            mute: { type: 'boolean', description: 'true mutes, false unmutes.' },
          },
        },
      },
      {
        name: 'media',
        description: 'Media keys for whatever is playing on the PC (Spotify, YouTube, any player).',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['playpause', 'next', 'previous', 'stop'] } }, required: ['action'] },
      },
      {
        name: 'open',
        description: 'Open an app, website or file on the PC: an app name (chrome, notepad, spotify, explorer, calc), a URL (https://…), a URI (spotify:, ms-settings:) or a full file path.',
        inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
      },
      {
        name: 'screenshot',
        description: "Take a screenshot of the whole screen and save it to Pictures\\Alfred Screenshots. Returns the file's path; read that file to see what is on the screen.",
      },
      { name: 'lock_screen', description: 'Lock the PC (the Windows lock screen).' },
      { name: 'battery', description: "The laptop's battery level and whether it is plugged in." },
      {
        name: 'remind',
        description:
          'Set a reminder or timer. Give in_minutes (a timer) or at ("HH:MM", or "YYYY-MM-DD HH:MM", local time). repeat: none, daily, weekdays or weekly. ask=true makes it a scheduled request: when due, the text is put to you as if the person asked it (e.g. "Give me my morning briefing"). Confirm back when it is due, in words.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'What to remind them of, or the request to carry out.' },
            in_minutes: { type: 'number' },
            at: { type: 'string' },
            repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly'] },
            ask: { type: 'boolean' },
          },
          required: ['text'],
        },
      },
      { name: 'list_reminders', description: 'List the reminders and scheduled requests that are set, soonest first, with their ids.' },
      {
        name: 'cancel_reminder',
        description: 'Cancel a reminder by its id (from list_reminders).',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    ]
    for (const t of winTools) regs.push($.tool.register({ ...t, isDeferred: false }))
    regs.push($.tool.register({
      name: 'weather',
      description: `Current weather and a 3-day forecast for a place (Open-Meteo). Use it for any weather question instead of a web search.${homeCity ? ` No place given means ${homeCity}.` : ''}`,
      inputSchema: { type: 'object', properties: { place: { type: 'string', description: 'A city or town, e.g. "Singapore" or "Paris, France".' } } },
      isDeferred: false,
    }))
    regs.push($.tool.register({
      name: 'update_self',
      description: `Check for a newer version of ${NAME} (this assistant's own plugin) and, with action "install", install it from ${NAME}'s own marketplace. Use "check" when asked whether there is an update; use "install" only when the person asks to update or agrees to an update you offered. The new version takes effect from the next session.`,
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['check', 'install'] } }, required: ['action'] },
      isDeferred: false,
    }))
    if (useMemory) {
      regs.push($.tool.register({
        name: 'remember',
        description: `Save one short, self-contained note to ${NAME}'s long-term memory (memory.md on the person's computer): a preference, a fact about them or their work, a decision, a project, a person. Use it whenever they tell you something worth keeping or ask you to remember something.`,
        inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'The note, one sentence, understandable on its own later.' } }, required: ['note'] },
        isDeferred: false,
      }))
      regs.push($.tool.register({
        name: 'recall',
        description: `Search ${NAME}'s memory: the notes and the full journal of past conversations with the person. Use it when they refer to anything earlier (what was decided, said, done, last week, before). Returns matching notes and journal entries, newest first.`,
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'A few key words to look for, e.g. "hub design" or "pnpm".' } }, required: ['query'] },
        isDeferred: false,
      }))
    }
    if (routing) regs.push($.agent.register(counselSpec(NAME, opts.title, strongModel)))
    if (voiceInput) {
      regs.push($.command.register({ name: 'listen', description: `${NAME}: speak your next prompt (or press Ctrl+Space)` }))
    }
    await Promise.all(regs.map(r => r.catch(err => $.ui.log(`register: ${String(err)}`, { to: 'debug' }))))

    const result = await next(e)
    // The Hub first, so it is up at once; everything else follows without holding it up.
    if (showHub) void $.ui.open({ id: HUB, title: NAME }).catch(() => undefined)
    if (routing) {
      void (async () => {
        const model = await $.session.model()
        if (isOpus(model) && !(await $.store.get('routing_hint_shown'))) {
          await $.store.set('routing_hint_shown', true)
          $.ui.toast(`${NAME} decides when to call on Opus. For everyday work, set the session to Sonnet once: /model sonnet`)
        }
      })().catch(() => undefined)
    }
    void refreshHud($)
    void refreshProject($)
    if (updateCheck) {
      void (async () => {
        const today = new Date().toDateString()
        if ((await $.store.get('update_checked_day')) === today) return
        await $.store.set('update_checked_day', today)
        const found = await checkForUpdate($)
        if (!found || (await $.store.get('update_announced')) === found.latest) return
        await $.store.set('update_announced', found.latest)
        hubLog($, 'jarvis', `Version ${found.latest} is available.${found.news[0] ? ` New: ${found.news[0]}` : ''}`)
        $.ui.toast(`${NAME} ${found.latest} is available. Say "update yourself", or /alfred update.`)
        // After the greeting, not over it.
        $.clock.after(6_000, () => speakPhrase($, 'updateReady', opts, { version: found.latest, news: found.news[0] ? ` ${found.news[0]}.` : '' }))
      })().catch(err => $.ui.log(`update check: ${String(err)}`, { to: 'debug' }))
    }
    if (voiceInput && hotkey) void armHotkey($, hotkey, opts, language)
    if (useLook) void $.theme.set(LOOK).catch(err => $.ui.log(`jarvis look not set: ${String(err)}`, { to: 'debug' }))
    if (useMemory) {
      void (async () => {
        memFolderShown = await memoryFolderShown($)
        await loadMemory($)
      })().catch(err => $.ui.log(`memory: not loaded: ${String(err)}`, { to: 'debug' }))
    }
    reminderTimer?.cancel()
    reminderTimer = $.clock.every(15_000, () => {
      void fireDue($, opts, false).catch(err => $.ui.log(`reminders: ${String(err)}`, { to: 'debug' }))
    })
    void fireDue($, opts, true).catch(() => undefined)
    // Greet once per session: a restart of the plugin (an update, a settings change) is not a new
    // session. After a restart, finish the line that was cut off, if it was cut off just now.
    const sessionId = await $.session.id().catch(() => '')
    const greeted = (await $.store.get(GREETED_KEY)) === sessionId && sessionId !== ''
    if (!greeted) {
      await $.store.set(GREETED_KEY, sessionId)
      await $.store.set(PLAYING_KEY, null)
      void briefing($, opts.title).then(line => speak($, line, opts))
    } else {
      const cut = (await $.store.get(PLAYING_KEY)) as { text?: string; at?: number } | null | undefined
      if (cut?.text && typeof cut.at === 'number' && Date.now() - cut.at < 60_000) void speak($, cut.text, opts)
    }
    return result
  })

  // The counsel at work: shown on the Hub, so it is plain which mind is on the task.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (e.subagentType === COUNSEL_TYPE && !r.deny) {
      hubLog($, 'jarvis', `Consulting my counsel (${r.model}): ${e.description}`)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Persona, appended to the system prompt.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return {
      ...r,
      sections: [
        ...r.sections,
        { id: 'jarvis:persona', text: persona(opts.title, NAME), scope: 'session' as const },
        { id: 'jarvis:knowledge', text: knowledgeSection(NAME, opts.title, homeCity), scope: 'session' as const },
        ...(pendingUpdate
          ? [{ id: 'jarvis:update', text: `${NAME} version ${pendingUpdate.version} is available and has been offered to the person. If they agree ("yes", "go ahead", "update yourself"), call update_self with action "install", then tell them it takes effect from the next session.`, scope: 'session' as const }]
          : []),
        ...(routing ? [{ id: 'jarvis:routing', text: routingSection(NAME, opts.title, strongModel), scope: 'session' as const }] : []),
        ...(useMemory
          ? [{ id: 'jarvis:memory', text: memorySection(NAME, opts.title, memFolderShown ?? '~/Alfred', memNotes, memRecent), scope: 'session' as const }]
          : []),
      ],
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
    const changesText = e.inputText !== '' || e.end > e.start
    if (changesText) {
      if (isListening) cancelListening($)
      stopSpeech(`you typed (${e.key ? `key ${JSON.stringify(e.key.key)}` : 'paste'})`)
    }
    const pasted = e.key === undefined ? e.inputText.trim() : ''
    if (autoSend && pasted && e.text.trim() === '' && looksDictated(pasted)) {
      const r = await next({ ...e, inputText: '' })
      submitSpoken($, pasted)
      speakPhrase($, 'ack', opts)
      return r
    }
    return next(e)
  })

  // Safety protocol: a destructive shell command is put to the person, out loud, whatever the mode.
  on('tool.check', async ($, e, next) => {
    // Alfred's own harmless tools run without asking; `open` goes through the normal permission check.
    if (SAFE_TOOLS.has(e.tool)) return { decision: 'allow' as const }
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict
    // Web: a search, or reading a public page, is part of what was asked; no permission each time.
    if (webFree && WEB_TOOLS.has(e.tool)) return webIsSafe(e.tool, e.input) ? { decision: 'allow' as const } : verdict
    if (useMemory && memFolder) {
      const input = (e.input ?? {}) as Record<string, unknown>
      const filePath = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
      const editsMemory = /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(e.tool) && filePath !== '' && touchesMemory(filePath, memFolder)
      const shell = SHELL_TOOLS.has(e.tool) && typeof input.command === 'string' ? input.command : ''
      const shellHitsMemory = shell !== '' && touchesMemory(shell, memFolder) && /\b(Remove-Item|rm|del|erase|rd|rmdir|Clear-Content|Set-Content|Out-File|Move-Item|mv|move|ren|Rename-Item|truncate)\b|>/i.test(shell)
      if (editsMemory || shellHitsMemory) {
        return { decision: 'ask' as const, reason: `${NAME}'s memory is only changed when you ask: this would edit or delete files in ${memFolderShown ?? memFolder}.` }
      }
    }
    if (!safety || !SHELL_TOOLS.has(e.tool)) return verdict
    const command = (e.input as { command?: unknown } | null)?.command
    const what = typeof command === 'string' ? riskOf(command) : undefined
    if (!what) return verdict
    safetySpokeAt = Date.now()
    hubSet($, st => ({ ...st, blocked: { what, command: String(command).slice(0, 160), at: Date.now() } }))
    speakPhrase($, 'safety', opts, { what })
    return { decision: 'ask' as const, reason: `${NAME}'s safety protocol: this command would ${what}.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { decision: 'ask' as const, reason: `${NAME}'s safety protocol could not check this command.` },
  )

  on('tool.run', { tool: 'mcp__jarvis__volume' }, async ($, e) => {
    const a = e as unknown as { set?: number; change?: number; mute?: boolean }
    if (typeof a.set === 'number') return { result: await windowsDo($, 'volume', 'set', String(a.set)) }
    if (typeof a.change === 'number') return { result: await windowsDo($, 'volume', 'change', String(a.change)) }
    if (a.mute === true) return { result: await windowsDo($, 'volume', 'mute') }
    if (a.mute === false) return { result: await windowsDo($, 'volume', 'unmute') }
    return { result: await windowsDo($, 'volume', 'get') }
  })
  on('tool.run', { tool: 'mcp__jarvis__media' }, async ($, e) => {
    const action = String((e as unknown as { action?: unknown }).action ?? '')
    if (!['playpause', 'next', 'previous', 'stop'].includes(action)) return { result: 'action must be playpause, next, previous or stop.' }
    return { result: await windowsDo($, 'media', action) }
  })
  on('tool.run', { tool: 'mcp__jarvis__open' }, async ($, e) => {
    const target = String((e as unknown as { target?: unknown }).target ?? '').trim()
    if (!target) return { result: 'Nothing to open: give an app, URL or file.' }
    return { result: await windowsDo($, 'open', '', target) }
  })
  on('tool.run', { tool: 'mcp__jarvis__screenshot' }, async $ => ({ result: await windowsDo($, 'screenshot') }))
  on('tool.run', { tool: 'mcp__jarvis__lock_screen' }, async $ => ({ result: await windowsDo($, 'lock') }))
  on('tool.run', { tool: 'mcp__jarvis__battery' }, async $ => ({ result: await windowsDo($, 'battery') }))

  on('tool.run', { tool: 'mcp__jarvis__remind' }, async ($, e) => {
    const a = e as unknown as { text?: unknown; in_minutes?: unknown; at?: unknown; repeat?: unknown; ask?: unknown }
    const text = String(a.text ?? '').trim()
    if (!text) return { result: 'Nothing to remind: text is empty.' }
    const repeat: Repeat = a.repeat === 'daily' || a.repeat === 'weekdays' || a.repeat === 'weekly' ? a.repeat : 'none'
    const now = new Date()
    const due = firstDue(now, typeof a.in_minutes === 'number' ? a.in_minutes : undefined, typeof a.at === 'string' ? a.at : undefined, repeat)
    if (typeof due === 'string') return { result: due }
    const r: Reminder = { id: Math.random().toString(36).slice(2, 7), text, due, repeat, ask: a.ask === true, created: now.getTime() }
    const list = [...(await getReminders($)), r].sort((x, y) => x.due - y.due)
    await setReminders($, list)
    return { result: `Set: ${describeReminder(r, now.getTime())}. It fires while a ${NAME} session is open.` }
  })
  on('tool.run', { tool: 'mcp__jarvis__list_reminders' }, async $ => {
    const list = await getReminders($)
    const now = Date.now()
    return { result: list.length ? list.map(r => describeReminder(r, now)).join('\n') : 'No reminders are set.' }
  })
  on('tool.run', { tool: 'mcp__jarvis__cancel_reminder' }, async ($, e) => {
    const id = String((e as unknown as { id?: unknown }).id ?? '').trim()
    const list = await getReminders($)
    const gone = list.find(r => r.id === id)
    if (!gone) return { result: `No reminder has the id "${id}". list_reminders shows them.` }
    await setReminders($, list.filter(r => r.id !== id))
    return { result: `Cancelled: "${gone.text}" (was due ${whenText(gone.due, Date.now())}).` }
  })

  on('tool.run', { tool: 'mcp__jarvis__update_self' }, async ($, e) => {
    const action = String((e as unknown as { action?: unknown }).action ?? 'check')
    if (action === 'install') return { result: await installUpdate($) }
    try {
      const found = await checkForUpdate($)
      return {
        result: found
          ? `Version ${found.latest} is available (installed: ${found.installed}).${found.news.length ? ` New: ${found.news.join('; ')}` : ''} Offer to install it.`
          : `Up to date: version ${await installedVersion($)}.`,
      }
    } catch (err) {
      return { result: `Could not check for updates: ${String(err).slice(0, 200)}` }
    }
  })
  on('tool.run', { tool: 'mcp__jarvis__weather' }, async ($, e) => {
    const place = String((e as unknown as { place?: unknown }).place ?? '') || homeCity
    try {
      return { result: await weatherFor($, place) }
    } catch (err) {
      return { result: `The weather service could not be reached: ${String(err).slice(0, 200)}` }
    }
  })

  on('tool.run', { tool: 'mcp__jarvis__remember' }, async ($, e) => {
    const note = String((e as unknown as { note?: unknown }).note ?? '')
    return { result: await rememberNote($, note) }
  })

  on('tool.run', { tool: 'mcp__jarvis__recall' }, async ($, e) => {
    const query = String((e as unknown as { query?: unknown }).query ?? '')
    return { result: await recallJournal($, query) }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      hubSet($, st => ({ ...st, working: true, turnStartedAt: Date.now() }))
      if (useMemory && e.text.trim()) pendingPrompts.set(e.turnId, e.text)
    }
    return next(e)
  })

  // Speak the opening line of each main-loop reply; announce long tasks finishing.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    hubSet($, st => ({ ...st, working: false, lastTaskMs: e.durationMs }))
    void refreshHud($)
    void refreshProject($)
    const said = pendingPrompts.get(e.turnId)
    pendingPrompts.delete(e.turnId)
    if (useMemory && said && e.answer) {
      void appendJournal($, said, e.answer)
        .then(() => loadMemory($))
        .catch(err => $.ui.log(`memory: journal not written: ${String(err)}`, { to: 'debug' }))
    }
    if (e.reason === 'answer' && e.answer) {
      const first = firstSentence(e.answer)
      if (e.durationMs >= longTaskMs) {
        void phrase($, 'doneLong', opts.title, { took: minutes(e.durationMs) }).then(done => speak($, `${done} ${first}`, opts))
        void $.ui.notify(first || 'Task complete.', { title: `${NAME} · task complete` }).catch(() => undefined)
      } else {
        void speak($, first, opts)
      }
    } else if (e.reason === 'error') {
      speakPhrase($, 'setback', opts)
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
      ? await phrase($, 'permission', opts.title, { msg })
      : /waiting|idle/i.test(msg)
        ? await phrase($, 'idle', opts.title)
        : msg
    void speak($, line.slice(0, MAX_SPOKEN), opts)
    return r
  }).catch(($, e, next) => next(e))

  // The JARVIS Hub: a panel beside the chat.
  on('ui.render', { component: 'Pane', requestId: HUB }, async ($, e) => {
    const { Box, Text, Button, Progress } = $.ui.resolve(e)
    const st = await read($, hub)
    const muted = (await $.store.get(MUTE_KEY)) === true
    const rich = e.surface === 'desktop' || e.surface === 'mobile'

    let ctx: number | undefined
    let limit: number | undefined
    let cost: number | undefined
    try {
      const u = await $.session.usage()
      ctx = u.context.percent
      limit = u.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
      cost = u.cost?.usd
    } catch {
      // best effort
    }
    // From the cache; a stale one is refreshed in the background and the Hub redraws when it lands.
    const { branch, changes } = project
    if (Date.now() - project.at > 20_000) void refreshProject($)

    const listening = st.mic !== 'idle'
    const mood: ReactorMood = st.voiceError
      ? 'error'
      : listening
        ? 'listening'
        : st.speaking
          ? 'speaking'
          : st.working
            ? 'working'
            : muted
              ? 'muted'
              : 'idle'
    const color = MOOD_COLOR[mood]
    const state = st.voiceError
      ? 'Voice error'
      : st.mic === 'warming'
        ? 'Warming up the microphone'
        : st.mic === 'listening'
          ? 'Listening'
          : st.mic === 'hearing'
            ? 'Hearing you'
            : st.mic === 'transcribing'
              ? 'Transcribing'
              : st.speaking
                ? 'Speaking'
                : st.working
                  ? `Working${st.turnStartedAt ? ` since ${clockTime(st.turnStartedAt)}` : ''}`
                  : muted
                    ? 'Muted · standing by'
                    : 'Standing by'
    const card = { flexDirection: 'column' as const, gap: 'xs' as const, borderStyle: 'round', borderColor: '#1e3a5f', paddingX: 'sm' as const, paddingY: 'xs' as const, ...(rich ? { backgroundColor: '#0b1422' } : {}) }
    const label = (t: string) => <Text size="caption" weight="semibold" color="#7dd3fc">{t.toUpperCase()}</Text>
    const blocked = st.blocked && Date.now() - st.blocked.at < 30 * 60_000 ? st.blocked : null

    const buttons = (
      <Box flexDirection="row" gap="sm" flexWrap="wrap" paddingX="sm">
        <Button key="listen" variant="primary" label={listening ? '■ Cancel' : '🎙 Listen'} onPress={() => {
          if (isListening) cancelListening($)
          else void hear($, opts, language)
        }} />
        <Button key="stop" label="⏹ Stop" onPress={() => stopSpeech('Stop button')} />
        <Button key="mute" label={muted ? '🔈 Unmute' : '🔇 Mute'} onPress={async () => {
          await $.store.set(MUTE_KEY, !muted)
          if (!muted) stopSpeech('muted')
          hubSet($, s => ({ ...s }))
          void refreshHud($)
        }} />
        <Button key="brief" label="📋 Brief" onPress={() => void briefing($, opts.title).then(line => speak($, line, opts))} />
      </Box>
    )

    // The desktop and mobile apps draw the designed panel: one SVG with live data, the buttons under it.
    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)
      const panelState: PanelState = mood === 'idle' || mood === 'muted' ? 'standby' : mood
      const view: PanelView = {
        state: panelState,
        label: state.replace(/^Working since /, 'Working · since ').replace(' · standing by', ''),
        voiceOn: !st.voiceError && !muted,
        micLive: listening,
        hotkey: voiceInput && hotkey ? { label: hotkey.label, ready: hotkeyState.includes('ready') } : null,
        ctxPct: ctx ?? null,
        limitPct: limit ?? null,
        lastTask: st.lastTaskMs !== null ? duration(st.lastTaskMs) : '—',
        branch: branch ?? 'no repo',
        gitStatus: changes === null ? '' : changes === 0 ? 'clean' : `${changes} change${changes === 1 ? '' : 's'}`,
        safety: blocked ? { reason: `Held ${clockTime(blocked.at)} · would ${blocked.what}`, cmd: blocked.command } : null,
        log: st.log.map(l => ({ who: l.who, time: clockTime(l.at), text: l.text })),
      }
      return (
        <Box flexDirection="column" gap="xs">
          <Svg source={panelSvg(view)} alt={`${NAME} Hub: ${state}`} />
          {buttons}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm" padding="xs">
        <Box flexDirection="row" gap="md" alignItems="center">
          <Text color={color}>◉</Text>
          <Box flexDirection="column">
            <Text size="heading" weight="bold" color={color}>{dotted(NAME)}</Text>
            <Text dimColor>{state}</Text>
          </Box>
        </Box>

        {buttons}

        <Box {...card}>
          {label('Systems')}
          {ctx !== undefined && <Progress label={`Context ${Math.round(ctx)}%`} value={ctx} max={100} />}
          {limit !== undefined && <Progress label={`5-hour limit ${Math.round(limit)}%`} value={limit} max={100} />}
          {limit === undefined && cost !== undefined && cost > 0 && <Text dimColor>Session cost ~${cost.toFixed(2)} (estimate)</Text>}
          <Text dimColor>
            Voice {st.voiceError ? 'offline' : muted ? 'muted' : 'online'} · Mic {st.mic}
            {voiceInput && hotkey ? ` · ${hotkeyState}` : ''}
            {st.lastTaskMs !== null ? ` · last task ${duration(st.lastTaskMs)}` : ''}
          </Text>
          {st.voiceError && <Text color="#f0524f" wrap="wrap">{st.voiceError}</Text>}
        </Box>

        <Box {...card}>
          {label('Project')}
          <Text>{branch ? `⎇ ${branch}` : 'Not a git repository'}</Text>
          {changes !== null && <Text dimColor>{changes === 0 ? 'Working tree clean' : `${changes} uncommitted change${changes === 1 ? '' : 's'}`}</Text>}
        </Box>

        {blocked && (
          <Box {...card} borderColor="#7f1d1d">
            {label('Safety protocol')}
            <Text color="#fca5a5">Held for your word at {clockTime(blocked.at)}: would {blocked.what}</Text>
            <Text dimColor mono wrap="truncate-end">{blocked.command}</Text>
          </Box>
        )}

        <Box {...card}>
          {label('Log')}
          {st.log.length === 0 && <Text dimColor>Nothing said yet.</Text>}
          {st.log.slice(-8).map(l => (
            <Text wrap="wrap" color={l.who === 'you' ? '#5eead4' : '#cfe3f3'}>
              <Text dimColor>{clockTime(l.at)} </Text>
              {l.who === 'you' ? 'You: ' : `${NAME}: `}
              {l.text}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'listen' }, async $ => {
    if (isListening) {
      cancelListening($)
      return { text: 'Stopped listening.' }
    }
    void hear($, opts, language)
    return { text: 'Listening… speak after the beep; I send it when you stop talking.' }
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== 'jarvis' && e.command !== 'alfred') return next(e)
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    switch ((verb || '').toLowerCase()) {
      case 'mute':
        await $.store.set(MUTE_KEY, true)
        hubSet($, st => ({ ...st }))
        void refreshHud($)
        return { text: `Muted. I shall keep my opinions to myself, ${opts.title}, for once.` }
      case 'unmute':
        await $.store.set(MUTE_KEY, false)
        hubSet($, st => ({ ...st }))
        void refreshHud($)
        speakPhrase($, 'resume', opts)
        return { text: 'Voice restored.' }
      case 'update': {
        if ((rest[0] ?? '').toLowerCase() === 'check') {
          const found = await checkForUpdate($).catch(err => { throw new Error(String(err)) })
          return { text: found ? `Version ${found.latest} is available (installed ${found.installed}).\n${found.news.map(n => `- ${n}`).join('\n')}\nInstall it with /${e.command} update` : `Up to date: version ${await installedVersion($)}.` }
        }
        const result = await installUpdate($)
        speakPhrase($, result.startsWith('Installed') ? 'updated' : 'ack', opts)
        return { text: result }
      }
      case 'say':
        void speak($, rest.join(' '), opts)
        return { text: `Speaking: ${rest.join(' ')}` }
      case 'test':
      case '': {
        const where = `engine ${opts.provider}, voice ${opts.provider === 'elevenlabs' ? opts.elVoice : opts.vsVoice}`
        const err = await speak($, await phrase($, 'test', opts.title), opts)
        if (!err) void refreshHud($)
        return { text: err ? `Voice test FAILED (${where}):\n${err}` : `Voice test played (${where}). If you heard nothing, check Windows volume and output device.` }
      }
      case 'stop':
      case 'quiet':
      case 'shh':
        stopSpeech('/alfred stop')
        return { text: 'Stopped speaking.' }
      case 'hub': {
        const opened = await $.ui.open({ id: HUB, title: NAME })
        return {
          text: opened.isPlaced
            ? `${NAME} Hub open.`
            : `${NAME} Hub opened. In the Claude desktop app it sits in the panel on the right; some terminals do not show panels.`,
        }
      }
      case 'memory': {
        const folder = await memoryFolderShown($)
        const days = await journalDays($)
        const notes = memNotes.split('\n').filter(l => l.startsWith('- ')).length
        return {
          text: `${NAME}'s memory: ${folder}\n${notes} note${notes === 1 ? '' : 's'} in ${NOTES_FILE}; ${days.length} day${days.length === 1 ? '' : 's'} of conversations in ${JOURNAL_DIR}\\.${days[0] ? ` Latest: ${days[0]}.` : ''}\nTo clear it: /alfred forget notes|conversations|everything yes`,
        }
      }
      case 'forget': {
        const what = (rest[0] ?? '').toLowerCase()
        const sure = (rest[1] ?? '').toLowerCase() === 'yes'
        if (what !== 'notes' && what !== 'conversations' && what !== 'everything') {
          return { text: `Usage: /${e.command} forget notes|conversations|everything yes\nnotes: ${NOTES_FILE}; conversations: the daily journal; everything: the whole memory folder. Nothing is deleted without "yes".` }
        }
        if (!sure) return { text: `This permanently deletes ${NAME}'s ${what === 'everything' ? 'entire memory' : what}. To confirm, run: /${e.command} forget ${what} yes` }
        return { text: await forgetMemory($, what) }
      }
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
        return { text: `Talk key: ${voiceInput ? hotkeyState : 'voice input off'}\nEngine ${opts.provider} · voice ${opts.provider === 'elevenlabs' ? opts.elVoice : opts.vsVoice} · ${(await $.store.get(MUTE_KEY)) === true ? 'muted' : 'speaking'}\nLast error: ${lastError ?? 'none'}\nSpeech last cut off: ${lastStop}` }
      default:
        return { text: `Usage: /${e.command} hub | stop | brief | memory | forget | test | status | check <command> | say <text> | mute | unmute | update [check] | accept-licences` }
    }
  })
}
