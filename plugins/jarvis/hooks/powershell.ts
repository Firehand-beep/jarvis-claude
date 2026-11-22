/** PowerShell's -EncodedCommand: base64 of the script as UTF-16LE (no Node/DOM here). */
export function encodePowerShell(script: string): string {
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

/** Decodes standard base64 to a UTF-8 string (no atob/TextDecoder here). */
export function decodeBase64Utf8(b64: string): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (A.indexOf(clean.charAt(i)) << 18) |
      (A.indexOf(clean.charAt(i + 1)) << 12) |
      ((A.indexOf(clean.charAt(i + 2)) & 63) << 6) |
      (A.indexOf(clean.charAt(i + 3)) & 63)
    bytes.push((n >> 16) & 255)
    if (i + 2 < clean.length) bytes.push((n >> 8) & 255)
    if (i + 3 < clean.length) bytes.push(n & 255)
  }
  let out = ''
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++] ?? 0
    let cp = b0
    if (b0 >= 0xf0) cp = ((b0 & 7) << 18) | (((bytes[i++] ?? 0) & 63) << 12) | (((bytes[i++] ?? 0) & 63) << 6) | ((bytes[i++] ?? 0) & 63)
    else if (b0 >= 0xe0) cp = ((b0 & 15) << 12) | (((bytes[i++] ?? 0) & 63) << 6) | ((bytes[i++] ?? 0) & 63)
    else if (b0 >= 0xc0) cp = ((b0 & 31) << 6) | ((bytes[i++] ?? 0) & 63)
    out += String.fromCodePoint(cp)
  }
  return out
}

export const POWERSHELL = ['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']
