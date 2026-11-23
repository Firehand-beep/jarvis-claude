// The safety protocol: shell commands JARVIS will not run without the person's word.
// Each rule says, in plain words, what the command would do; that is what JARVIS speaks.

export type RiskRule = { re: RegExp; what: string }

export const RISKY: readonly RiskRule[] = [
  // Deleting
  { re: /(^|[\s;&|(])rm\s+(-\S*\s+)*-\S*[rRf]/, what: 'permanently delete files' },
  { re: /\bRemove-Item\b[^|;]*-Recurse/i, what: 'delete a folder and everything in it' },
  { re: /\b(rd|rmdir)\s+\/s\b/i, what: 'delete a folder and everything in it' },
  { re: /\bdel\s+(\/[a-z]\s*)*\/[sq]\b/i, what: 'delete files' },
  // Git history and uncommitted work
  { re: /\bgit\s+push\b[^;&|]*\s(--force\b|--force-with-lease\b|-f\b|\+\S)/, what: 'force-push and rewrite history on the remote' },
  { re: /\bgit\s+reset\s+[^;&|]*--hard\b/, what: 'throw away all uncommitted work' },
  { re: /\bgit\s+clean\s+-\S*f/, what: 'delete untracked files' },
  { re: /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, what: 'discard local changes' },
  { re: /\bgit\s+branch\s+(-\S*\s+)*-D\b/, what: 'delete a branch' },
  { re: /\bgit\s+stash\s+(drop|clear)\b/, what: 'delete stashed work' },
  // Databases
  { re: /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE(\s+TABLE)?\s+\w)/i, what: 'drop database data' },
  { re: /\bDELETE\s+FROM\s+[\w."`]+\s*(;|"|'|$)/i, what: 'delete every row of a table' },
  // Releasing and deploying
  { re: /\b(npm|pnpm|yarn)\s+publish\b/, what: 'publish a package' },
  { re: /\bvercel\b[^;&|]*--prod\b|\bnetlify\s+deploy\b[^;&|]*--prod\b|\bfirebase\s+deploy\b|\bfly\s+deploy\b|\brailway\s+up\b/, what: 'deploy to production' },
  { re: /\bterraform\s+(apply|destroy)\b/, what: 'change live infrastructure' },
  { re: /\bkubectl\s+(delete|apply|replace)\b/, what: 'change a live cluster' },
  { re: /\bdocker\s+(system|volume|image|container)\s+prune\b/, what: 'delete Docker data' },
  // The machine itself
  { re: /\b(Format-Volume|diskpart)\b|\bformat\s+[a-z]:/i, what: 'format a disk' },
  { re: /\b(shutdown(\.exe)?\s+[-\/]|Restart-Computer|Stop-Computer)\b/i, what: 'restart or shut down the computer' },
  { re: /\breg(\.exe)?\s+delete\b|\bRemove-ItemProperty\b[^|;]*HK(LM|CU)/i, what: 'edit the Windows registry' },
]

/** What the command would do, if it is on the list; undefined when it is not. */
export function riskOf(command: string): string | undefined {
  for (const rule of RISKY) if (rule.re.test(command)) return rule.what
  return undefined
}

/** The shell tools whose `command` the protocol reads. */
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

// ---------------------------------------------------------------------------
// Web access: searching and reading public pages needs no permission each time.

/** The tools that search the web or read a page. */
export const WEB_TOOLS = new Set(['WebSearch', 'WebFetch'])

/** Hosts on this computer or the home network: Alfred's own services live there, so reading them still asks. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === '::1' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^0\./.test(h) ||
    !h.includes('.')
  )
}

/**
 * Whether a web call can go ahead without asking: every search, and reading any public page by an
 * ordinary address. Still asked: pages on this computer or the home network, and very long
 * addresses (a page could try to smuggle private details out in one).
 */
export function webIsSafe(tool: string, input: unknown): boolean {
  if (tool === 'WebSearch') return true
  if (tool !== 'WebFetch') return false
  const raw = (input as { url?: unknown } | null)?.url
  if (typeof raw !== 'string' || raw.length > 400) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username || url.password) return false
  return !isPrivateHost(url.hostname)
}
