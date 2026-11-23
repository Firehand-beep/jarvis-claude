// Voice input on Windows: record from the default microphone until the speaker goes quiet,
// then have VoiceStudio's speech-recognition engine (POST /v1/audio/transcriptions) write it down.
//
// PowerShell compiles a small C# recorder over winmm (built into Windows, nothing to install).
// It reports on stdout, one token per line:
//   READY        recording has started (after a short high beep)
//   .  / S       heartbeat every 100 ms, before / after speech was detected
//   NOSPEECH     nobody spoke before the start timeout
//   HEARD        recording stopped (short low beep); transcribing
//   TEXT <b64>   the engine's JSON answer, base64 of its UTF-8 bytes
//   FAIL <b64>   the engine's error body, base64 of its UTF-8 bytes
// The heartbeat lets the plugin cancel at once by ending the process.

import { decodeBase64Utf8, encodePowerShell } from './powershell'

const LISTEN_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Out-Line([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
$src = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class JarvisMic {
  [StructLayout(LayoutKind.Sequential)]
  struct WaveFormat { public ushort Tag; public ushort Channels; public uint Rate; public uint ByteRate; public ushort Align; public ushort Bits; public ushort Extra; }

  [StructLayout(LayoutKind.Sequential)]
  struct WaveHdr { public IntPtr Data; public uint Length; public uint Recorded; public IntPtr User; public uint Flags; public uint Loops; public IntPtr Next; public IntPtr Reserved; }

  [DllImport("winmm.dll")] static extern int waveInOpen(out IntPtr h, int device, ref WaveFormat fmt, IntPtr cb, IntPtr inst, int flags);
  [DllImport("winmm.dll")] static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInUnprepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInStart(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInReset(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInClose(IntPtr h);

  static void Say(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }

  // 16 kHz mono 16-bit PCM from the default microphone, until the speaker has been quiet for silenceMs.
  public static byte[] Record(int maxMs, int silenceMs, int startTimeoutMs) {
    const int Rate = 16000, ChunkMs = 50, Buffers = 10;
    int chunkBytes = Rate * 2 * ChunkMs / 1000;
    WaveFormat fmt = new WaveFormat();
    fmt.Tag = 1; fmt.Channels = 1; fmt.Rate = Rate; fmt.ByteRate = Rate * 2; fmt.Align = 2; fmt.Bits = 16; fmt.Extra = 0;
    IntPtr h;
    int rc = waveInOpen(out h, -1, ref fmt, IntPtr.Zero, IntPtr.Zero, 0);
    if (rc != 0) throw new Exception("Could not open the microphone (waveInOpen error " + rc + "). Check Windows Settings > Privacy & security > Microphone, and that a microphone is connected.");
    int hdrSize = Marshal.SizeOf(typeof(WaveHdr));
    IntPtr[] hdrs = new IntPtr[Buffers];
    IntPtr[] datas = new IntPtr[Buffers];
    MemoryStream output = new MemoryStream();
    bool speaking = false;
    try {
      for (int i = 0; i < Buffers; i++) {
        datas[i] = Marshal.AllocHGlobal(chunkBytes);
        hdrs[i] = Marshal.AllocHGlobal(hdrSize);
        WaveHdr w = new WaveHdr();
        w.Data = datas[i];
        w.Length = (uint)chunkBytes;
        Marshal.StructureToPtr(w, hdrs[i], false);
        waveInPrepareHeader(h, hdrs[i], hdrSize);
        waveInAddBuffer(h, hdrs[i], hdrSize);
      }
      rc = waveInStart(h);
      if (rc != 0) throw new Exception("Could not start recording (waveInStart error " + rc + ").");
      double noise = 0;
      int noiseChunks = 0, elapsed = 0, quiet = 0, next = 0, waited = 0;
      byte[] chunk = new byte[chunkBytes];
      while (true) {
        WaveHdr w = (WaveHdr)Marshal.PtrToStructure(hdrs[next], typeof(WaveHdr));
        if ((w.Flags & 1) == 0) {
          Thread.Sleep(5);
          waited += 5;
          if (waited > 3000) throw new Exception("The microphone sent no audio for 3 seconds. Is another app holding it?");
          continue;
        }
        waited = 0;
        int n = (int)w.Recorded;
        if (n > chunkBytes) n = chunkBytes;
        Marshal.Copy(w.Data, chunk, 0, n);
        waveInAddBuffer(h, hdrs[next], hdrSize);
        next = (next + 1) % Buffers;

        double sum = 0;
        for (int i = 0; i + 1 < n; i += 2) { short s = (short)(chunk[i] | (chunk[i + 1] << 8)); sum += (double)s * s; }
        double rms = n > 1 ? Math.Sqrt(sum / (n / 2)) : 0;
        elapsed += ChunkMs;
        output.Write(chunk, 0, n);

        if (elapsed <= 300) { noise += rms; noiseChunks++; }
        double floor = noiseChunks > 0 ? noise / noiseChunks : 0;
        double threshold = Math.Max(floor * 2.5, 450);
        if (elapsed > 300) {
          if (!speaking && rms > threshold) speaking = true;
          if (speaking) {
            if (rms < threshold * 0.8) quiet += ChunkMs; else quiet = 0;
            if (quiet >= silenceMs) break;
          } else if (elapsed >= startTimeoutMs) {
            break;
          }
        }
        if (elapsed >= maxMs) break;
        if (elapsed % 100 == 0) Say(speaking ? "S" : ".");
      }
    } finally {
      waveInReset(h);
      for (int i = 0; i < Buffers; i++) {
        if (hdrs[i] != IntPtr.Zero) { waveInUnprepareHeader(h, hdrs[i], hdrSize); Marshal.FreeHGlobal(hdrs[i]); }
        if (datas[i] != IntPtr.Zero) Marshal.FreeHGlobal(datas[i]);
      }
      waveInClose(h);
    }
    return speaking ? output.ToArray() : new byte[0];
  }
}
'@
Add-Type -TypeDefinition $src
try { [Console]::Beep(880, 90) } catch {}
Out-Line 'READY'
$pcm = [JarvisMic]::Record([int]$env:JARVIS_MAX_MS, [int]$env:JARVIS_SILENCE_MS, [int]$env:JARVIS_START_MS)
if ($pcm.Length -eq 0) { Out-Line 'NOSPEECH'; exit 0 }
try { [Console]::Beep(620, 90) } catch {}
Out-Line 'HEARD'

$rate = 16000
$wav = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter($wav)
$w.Write([Text.Encoding]::ASCII.GetBytes('RIFF'))
$w.Write([int](36 + $pcm.Length))
$w.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
$w.Write([int]16)
$w.Write([int16]1)
$w.Write([int16]1)
$w.Write([int]$rate)
$w.Write([int]($rate * 2))
$w.Write([int16]2)
$w.Write([int16]16)
$w.Write([Text.Encoding]::ASCII.GetBytes('data'))
$w.Write([int]$pcm.Length)
$w.Write($pcm)
$w.Flush()
$audio = $wav.ToArray()

# Enrolment: keep the recording, transcribe nothing.
if ($env:ALFRED_SAVE) {
  [IO.File]::WriteAllBytes($env:ALFRED_SAVE, $audio)
  Out-Line 'SAVED'
  exit 0
}

# Voice ID: only the enrolled voice goes on to be transcribed. Any failure refuses.
function B64([string]$s) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)) }
if ($env:ALFRED_VID_SCRIPT) {
  $tmpWav = Join-Path $env:TEMP ('alfred-vid-' + [guid]::NewGuid().ToString('N') + '.wav')
  [IO.File]::WriteAllBytes($tmpWav, $audio)
  $ErrorActionPreference = 'Continue'
  try {
    if (Get-Command py -ErrorAction SilentlyContinue) { $res = & py -3 $env:ALFRED_VID_SCRIPT verify $env:ALFRED_DIR $tmpWav 2>$null }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { $res = & python $env:ALFRED_VID_SCRIPT verify $env:ALFRED_DIR $tmpWav 2>$null }
    else { $res = $null }
  } finally { Remove-Item $tmpWav -ErrorAction SilentlyContinue }
  $ErrorActionPreference = 'Stop'
  $line = @($res) | Where-Object { "$_" -like '{*' } | Select-Object -Last 1
  if (-not $line) { Out-Line ('VIDERR ' + (B64 'Python was not found or did not answer')); exit 0 }
  $v = $line | ConvertFrom-Json
  if (-not $v.ok) { Out-Line ('VIDERR ' + (B64 ([string]$v.error + ' ' + [string]$v.detail))); exit 0 }
  if ([double]$v.score -lt [double]$env:ALFRED_VID_MIN) { Out-Line ('REJECT ' + $v.score); exit 0 }
  Out-Line ('VOICEOK ' + $v.score)
}

$nl = [string][char]13 + [string][char]10
$q = [string][char]34
$boundary = 'jarvis' + [guid]::NewGuid().ToString('N')
$enc = [Text.Encoding]::UTF8
$body = New-Object IO.MemoryStream
function Add-Text([string]$s) { $b = $enc.GetBytes($s); $body.Write($b, 0, $b.Length) }
function Add-Field([string]$name, [string]$value) {
  Add-Text ('--' + $boundary + $nl + 'Content-Disposition: form-data; name=' + $q + $name + $q + $nl + $nl + $value + $nl)
}
Add-Field 'model' 'whisper-1'
Add-Field 'response_format' 'json'
if ($env:JARVIS_LANG) { Add-Field 'language' $env:JARVIS_LANG }
Add-Text ('--' + $boundary + $nl + 'Content-Disposition: form-data; name=' + $q + 'file' + $q + '; filename=' + $q + 'jarvis.wav' + $q + $nl + 'Content-Type: audio/wav' + $nl + $nl)
$audio = $wav.ToArray()
$body.Write($audio, 0, $audio.Length)
Add-Text ($nl + '--' + $boundary + '--' + $nl)

try {
  $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $env:JARVIS_URL -ContentType ('multipart/form-data; boundary=' + $boundary) -Body $body.ToArray() -TimeoutSec 120
  Out-Line ('TEXT ' + [Convert]::ToBase64String($resp.RawContentStream.ToArray()))
} catch [System.Net.WebException] {
  $r = $_.Exception.Response
  if ($null -eq $r) { throw }
  $m = New-Object IO.MemoryStream
  $r.GetResponseStream().CopyTo($m)
  Out-Line ('FAIL ' + [Convert]::ToBase64String($m.ToArray()))
}
`

export const LISTEN_ENCODED = encodePowerShell(LISTEN_SCRIPT)

export type ListenOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'saved' }
  | { kind: 'reject'; score: number }
  | { kind: 'viderr'; why: string }
  | { kind: 'nospeech' }
  | { kind: 'fail'; body: string }
  | { kind: 'broken'; why: string }

/** Reads what the recorder printed. */
export function parseListen(stdout: string, stderr: string, exitCode: number): ListenOutcome {
  const text = /^TEXT (\S+)/m.exec(stdout)
  if (text?.[1]) {
    const raw = decodeBase64Utf8(text[1])
    try {
      const said = String((JSON.parse(raw) as { text?: unknown }).text ?? '').trim()
      return said ? { kind: 'text', text: said } : { kind: 'nospeech' }
    } catch {
      return { kind: 'text', text: raw.trim() }
    }
  }
  if (/^SAVED/m.test(stdout)) return { kind: 'saved' }
  const reject = /^REJECT (\S+)/m.exec(stdout)
  if (reject) return { kind: 'reject', score: Number(reject[1]) }
  const viderr = /^VIDERR (\S+)/m.exec(stdout)
  if (viderr?.[1]) return { kind: 'viderr', why: decodeBase64Utf8(viderr[1]).trim() }
  const fail = /^FAIL (\S+)/m.exec(stdout)
  if (fail?.[1]) return { kind: 'fail', body: decodeBase64Utf8(fail[1]) }
  if (/^NOSPEECH/m.test(stdout)) return { kind: 'nospeech' }
  const why = stderr.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const reason = why.find(l => /Exception|error|Could not|microphone/i.test(l)) ?? why.slice(-1)[0]
  return { kind: 'broken', why: (reason ?? `exit ${exitCode}`).slice(0, 300) }
}

/** The models a 403 model_licence_required names, ready to accept. */
export function licenceModels(body: string): { repo_id: string; fingerprint: string; license?: string }[] {
  try {
    const j = JSON.parse(body) as { detail?: { models?: unknown }; error?: unknown }
    const models = (j.detail as { models?: unknown } | undefined)?.models
    return Array.isArray(models)
      ? models.filter(
          (m): m is { repo_id: string; fingerprint: string; license?: string } =>
            typeof m?.repo_id === 'string' && typeof m?.fingerprint === 'string',
        )
      : []
  } catch {
    return []
  }
}

/** The engine's error message, for a person. */
export function failMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string }; detail?: unknown }
    const m = j.error?.message ?? (typeof j.detail === 'string' ? j.detail : (j.detail as { message?: string })?.message)
    return String(m ?? body).slice(0, 300)
  } catch {
    return body.slice(0, 300)
  }
}
