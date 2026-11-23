/**
 * Alfred keeps himself up to date: he checks his marketplace for a newer version, says what is new,
 * and installs it when the person agrees. Only his own marketplace, never anything else.
 */

export const MARKETPLACE = 'jarvis-claude'
export const PLUGIN_ID = `jarvis@${MARKETPLACE}`
export const REPO_RAW = 'https://raw.githubusercontent.com/Firehand-beep/jarvis-claude/main'
export const LATEST_MANIFEST_URL = `${REPO_RAW}/plugins/jarvis/.claude-plugin/plugin.json`
export const CHANGELOG_URL = `${REPO_RAW}/CHANGELOG.md`

/** Compares dotted versions: positive when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  const pb = b.trim().replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The version in a plugin.json text, or undefined. */
export function versionOf(manifestText: string): string | undefined {
  try {
    const v = (JSON.parse(manifestText) as { version?: unknown }).version
    return typeof v === 'string' && /^\d+(\.\d+)*/.test(v) ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * What is new since `installed`: the changelog's entries for newer versions, newest first, as
 * plain lines. The changelog has `## 0.18.0` headings, each followed by `- ` bullet lines.
 */
export function whatsNew(changelog: string, installed: string, max = 6): string[] {
  const out: string[] = []
  let take = false
  for (const raw of changelog.split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^##\s+v?(\d+(?:\.\d+)*)/.exec(line)
    if (head) {
      take = compareVersions(head[1]!, installed) > 0
      continue
    }
    if (take && line.startsWith('- ')) out.push(line.slice(2).trim())
    if (out.length >= max) break
  }
  return out
}

/** The commands that install the latest version, the same two the person would type. */
export const UPDATE_STEPS: readonly (readonly string[])[] = [
  ['plugin', 'marketplace', 'update', MARKETPLACE],
  ['plugin', 'update', PLUGIN_ID],
]

/** A PowerShell script running both steps through `claude`, wherever npm or the installer put it. */
export function windowsUpdateScript(): string {
  const lines = UPDATE_STEPS.map(args => `& claude ${args.join(' ')} 2>&1 | Out-String | Write-Output`)
  return ['$ErrorActionPreference = "Continue"', ...lines, 'exit $LASTEXITCODE'].join('\n')
}
