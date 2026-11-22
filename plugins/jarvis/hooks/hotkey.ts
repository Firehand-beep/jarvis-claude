// A system-wide talk key on Windows: a hidden PowerShell process registers the hotkey with
// Windows (user32 RegisterHotKey) and prints HOTKEY each time it is pressed, in any app.
// It lives as long as the session's plugin; ending the process frees the key.
//   ARMED          the key is registered
//   TAKEN <code>   another app (or another JARVIS session) already holds that key
//   HOTKEY         pressed

import { encodePowerShell } from './powershell'

const HOTKEY_SCRIPT = `
$ErrorActionPreference = 'Stop'
$src = @'
using System;
using System.Runtime.InteropServices;

public static class JarvisHotkey {
  [StructLayout(LayoutKind.Sequential)]
  struct Msg { public IntPtr Hwnd; public uint Message; public IntPtr WParam; public IntPtr LParam; public uint Time; public int X; public int Y; }

  [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
  [DllImport("user32.dll")] static extern int GetMessage(out Msg msg, IntPtr hWnd, uint min, uint max);

  static void Say(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }

  public static void Run(uint mods, uint vk) {
    // 0x4000 = MOD_NOREPEAT: holding the keys down fires once.
    if (!RegisterHotKey(IntPtr.Zero, 1, mods | 0x4000, vk)) { Say("TAKEN " + Marshal.GetLastWin32Error()); return; }
    Say("ARMED");
    Msg m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) {
      if (m.Message == 0x0312) Say("HOTKEY");
    }
  }
}
'@
Add-Type -TypeDefinition $src
[JarvisHotkey]::Run([uint32]$env:JARVIS_MODS, [uint32]$env:JARVIS_VK)
`

export const HOTKEY_ENCODED = encodePowerShell(HOTKEY_SCRIPT)

export type Hotkey = { mods: number; vk: number; label: string }

const MODS: Record<string, number> = { alt: 0x1, ctrl: 0x2, control: 0x2, shift: 0x4, win: 0x8 }

/**
 * "ctrl+space", "ctrl+shift+j", "alt+f9" -> Windows modifier flags and virtual-key code.
 * Undefined for plain "space" (the in-prompt key) or anything without a modifier.
 */
export function parseHotkey(spec: string): Hotkey | undefined {
  const parts = spec.toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean)
  const key = parts.pop()
  if (!key || parts.length === 0) return undefined
  let mods = 0
  for (const p of parts) {
    const m = MODS[p]
    if (m === undefined) return undefined
    mods |= m
  }
  let vk: number | undefined
  if (key === 'space') vk = 0x20
  else if (/^[a-z]$/.test(key)) vk = key.toUpperCase().charCodeAt(0)
  else if (/^[0-9]$/.test(key)) vk = key.charCodeAt(0)
  else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) vk = 0x6f + Number(key.slice(1))
  if (vk === undefined) return undefined
  const label = [...parts.map(p => (p === 'control' ? 'Ctrl' : p.charAt(0).toUpperCase() + p.slice(1))), key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)].join('+')
  return { mods, vk, label }
}
