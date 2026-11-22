// Alfred's memory: plain files in ~/Alfred on the person's computer.
//   memory.md                     dated notes (preferences, facts, projects, decisions)
//   conversations/YYYY-MM-DD.md   the full journal, one file a day, every exchange
// Nothing here deletes anything: forgetting is the person's command alone (/alfred forget … yes).

export const NOTES_FILE = 'memory.md'
export const JOURNAL_DIR = 'conversations'

const pad = (n: number) => String(n).padStart(2, '0')
export const dayStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const timeStamp = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** A note line for memory.md. */
export function noteLine(note: string, at: Date): string {
  return `- ${dayStamp(at)}: ${note.replace(/\s+/g, ' ').trim()}`
}

/** A fresh memory.md. */
export function notesHeader(name: string): string {
  return `# ${name}'s notes\n\nWhat ${name} has been asked to remember, or judged worth keeping. Edit freely.\n\n`
}

/** A journal entry: what was said, and the whole answer. */
export function journalEntry(name: string, at: Date, said: string, answer: string): string {
  return `\n### ${timeStamp(at)}\n\n**You:** ${said.trim()}\n\n**${name}:** ${answer.trim()}\n`
}

export function journalHeader(name: string, day: string): string {
  return `# Conversations with ${name}: ${day}\n`
}

/** The last `count` entries of a day's journal, each answer cut short, oldest first. */
export function recentEntries(journal: string, day: string, count: number, answerChars = 400): string[] {
  const parts = journal.split(/\n### /).slice(1)
  return parts.slice(-count).map(p => {
    const [time = '', ...rest] = p.split('\n')
    const body = rest.join('\n').trim()
    const cut = body.replace(/(\*\*[^*]+:\*\* )([\s\S]*)$/, (_m, who: string, text: string) =>
      who + (text.length > answerChars ? `${text.slice(0, answerChars).trimEnd()}…` : text),
    )
    return `[${day} ${time.trim()}] ${cut.replace(/\n{2,}/g, '\n')}`
  })
}

/** Entries of a day's journal that mention every word of the query. */
export function searchJournal(journal: string, day: string, query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  if (words.length === 0) return []
  return journal
    .split(/\n### /)
    .slice(1)
    .filter(p => {
      const low = p.toLowerCase()
      return words.every(w => low.includes(w))
    })
    .map(p => `[${day} ${p.split('\n')[0]?.trim() ?? ''}]\n${p.split('\n').slice(1).join('\n').trim()}`)
}

/** The system-prompt section: how to use the memory, the notes, and the latest exchanges. */
export function memorySection(name: string, title: string, folder: string, notes: string, recent: string[]): string {
  const notesBody = notes.replace(/^# .*\n+(.*\n+)?/, '').trim()
  return `# ${name}'s memory

You keep a memory for ${title}, in plain files on their computer (${folder}): your notes
(memory.md) and a full journal of every conversation (conversations/, one file a day). The
journal is written for you after each reply; you do not need to write it.

- When ${title} tells you something worth keeping (a preference, a fact about them or their
  work, a decision, a project, a person), or asks you to remember something, call the
  remember tool with one short, self-contained note. Do not announce every note.
- When they refer to an earlier conversation ("what did we decide", "last week", "remember
  when"), call the recall tool before answering, rather than guessing.
- Never delete, clear, truncate or rewrite memory.md or the conversations folder, by any
  means, and never remove a note. If they want something forgotten, tell them to run
  /alfred forget (notes, conversations or everything, followed by "yes").

## Your notes
${notesBody || '(none yet)'}

## The latest exchanges (oldest first)
${recent.length ? recent.join('\n\n') : '(none yet)'}`
}

/** Whether a shell command or file edit would delete or overwrite the memory folder. */
export function touchesMemory(text: string, folder: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase()
  const t = norm(text)
  const f = norm(folder)
  const home = f.replace(/\/alfred$/, '')
  const mentions = t.includes(f) || /(^|[\s'"=(])~\/alfred\b/.test(t) || t.includes('$home/alfred') || t.includes('$env:userprofile/alfred') || t.includes('%userprofile%/alfred') || (home !== f && t.includes(`${home}/alfred`))
  return mentions
}
