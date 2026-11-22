// Windows control: volume, media keys, opening things, screenshots, locking, battery.
// One PowerShell script (built into Windows, nothing installed) switches on ALFRED_ACTION and
// prints one line of JSON: { ok: true, ... } or { ok: false, error }.

import { encodePowerShell } from './powershell'

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Done($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); exit 0 }
try {
  $action = $env:ALFRED_ACTION
  if ($action -like 'volume*' -or $action -like 'media*') {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

public static class AlfredAudio {
  static IAudioEndpointVolume Vol() {
    IMMDeviceEnumerator e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume v = null;
    Guid id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out v));
    return v;
  }
  public static float GetLevel() { float l; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out l)); return l; }
  public static void SetLevel(float l) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(l, Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }

  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
'@
  }
  switch ($action) {
    'volume' {
      $mode = $env:ALFRED_MODE
      $n = [double]($env:ALFRED_VALUE)
      if ($mode -eq 'set') { [AlfredAudio]::SetLevel([float]([Math]::Max(0, [Math]::Min(100, $n)) / 100)); [AlfredAudio]::SetMute($false) }
      elseif ($mode -eq 'change') { $l = [AlfredAudio]::GetLevel() * 100 + $n; [AlfredAudio]::SetLevel([float]([Math]::Max(0, [Math]::Min(100, $l)) / 100)); if ($n -gt 0) { [AlfredAudio]::SetMute($false) } }
      elseif ($mode -eq 'mute') { [AlfredAudio]::SetMute($true) }
      elseif ($mode -eq 'unmute') { [AlfredAudio]::SetMute($false) }
      Done @{ ok = $true; level = [int][Math]::Round([AlfredAudio]::GetLevel() * 100); muted = [AlfredAudio]::GetMute() }
    }
    'media' {
      $keys = @{ playpause = 0xB3; next = 0xB0; previous = 0xB1; stop = 0xB2 }
      [AlfredAudio]::Key([byte]$keys[$env:ALFRED_MODE])
      Done @{ ok = $true; sent = $env:ALFRED_MODE }
    }
    'open' {
      Start-Process -FilePath $env:ALFRED_VALUE
      Done @{ ok = $true; opened = $env:ALFRED_VALUE }
    }
    'screenshot' {
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
      $dir = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Alfred Screenshots'
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      $file = Join-Path $dir ('Screenshot ' + (Get-Date -Format 'yyyy-MM-dd HH.mm.ss') + '.png')
      $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      Done @{ ok = $true; path = $file; width = $b.Width; height = $b.Height }
    }
    'lock' {
      Start-Process -FilePath 'rundll32.exe' -ArgumentList 'user32.dll,LockWorkStation'
      Done @{ ok = $true }
    }
    'battery' {
      $bat = Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1
      if ($null -eq $bat) { Done @{ ok = $true; hasBattery = $false } }
      $plugged = @(2, 6, 7, 8, 9) -contains [int]$bat.BatteryStatus
      Done @{ ok = $true; hasBattery = $true; percent = [int]$bat.EstimatedChargeRemaining; pluggedIn = $plugged; minutesLeft = $bat.EstimatedRunTime }
    }
    default { Done @{ ok = $false; error = "unknown action $action" } }
  }
} catch {
  Done @{ ok = $false; error = $_.Exception.Message }
}
`

export const WINDOWS_ENCODED = encodePowerShell(SCRIPT)

export type WinAction = 'volume' | 'media' | 'open' | 'screenshot' | 'lock' | 'battery'

/** The result line the script printed, as an object; a failure when there is none. */
export function parseWindows(stdout: string, stderr: string): Record<string, unknown> {
  const line = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{')).pop()
  if (line) {
    try {
      return JSON.parse(line) as Record<string, unknown>
    } catch {
      // fall through
    }
  }
  return { ok: false, error: (stderr.trim().split(/\r?\n/).pop() ?? 'no answer from PowerShell').slice(0, 300) }
}

/** One plain sentence for the model to say back. */
export function describeWindows(action: WinAction, r: Record<string, unknown>): string {
  if (r.ok !== true) return `That did not work: ${String(r.error ?? 'unknown error')}`
  switch (action) {
    case 'volume':
      return r.muted === true ? `Volume is ${r.level}%, muted.` : `Volume is now ${r.level}%.`
    case 'media':
      return `Sent the ${String(r.sent)} media key to whatever is playing.`
    case 'open':
      return `Opened ${String(r.opened)}.`
    case 'screenshot':
      return `Screenshot saved to ${String(r.path)} (${r.width}x${r.height}). Read that file to see the screen.`
    case 'lock':
      return 'The PC is locked.'
    case 'battery':
      return r.hasBattery === false
        ? 'This PC has no battery; it runs on mains power.'
        : `Battery at ${r.percent}%, ${r.pluggedIn ? 'plugged in' : `on battery${typeof r.minutesLeft === 'number' && (r.minutesLeft as number) < 10000 ? `, about ${Math.round((r.minutesLeft as number) / 60 * 10) / 10} hours left` : ''}`}.`
  }
}
