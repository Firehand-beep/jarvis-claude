/**
 * Alfred's fixed lines, each with many wordings, so the same situation never sounds the same twice
 * running. `{t}` is how he addresses the person ("sir"), `{T}` the same capitalised, and other
 * `{name}` slots are filled by the caller.
 */

export const PHRASES = {
  ack: [
    'Very good, {t}.',
    'At once, {t}.',
    "I'll see to it, {t}.",
    'As you wish, {t}.',
    'Consider it done, {t}.',
    'Right away, {t}.',
    'Certainly, {t}.',
    'Of course, {t}.',
    "Leave it with me, {t}.",
    'Directly, {t}.',
    "I'm on it, {t}.",
    'With pleasure, {t}.',
    'Quite so, {t}. One moment.',
    'Understood, {t}.',
  ],
  morning: [
    "Good morning, {t}. I trust you slept, and that you'll eat something.",
    'Good morning, {t}. The kettle, I suspect, would be a sound first step.',
    "Morning, {t}. A fresh day, and so far an unblemished one.",
    'Good morning, {t}. Ready when you are; breakfast first, if I may.',
    "Good morning, {t}. I've kept everything in order overnight.",
    'Good morning, {t}. Shall we begin?',
    'A very good morning to you, {t}.',
    "Good morning, {t}. Let's make an honest start of it.",
  ],
  afternoon: [
    'Good afternoon, {t}. At your service.',
    'Good afternoon, {t}. What shall we turn our hand to?',
    'Good afternoon, {t}. I hope lunch was more than a biscuit.',
    'Afternoon, {t}. Everything is as you left it.',
    'Good afternoon, {t}. Ready when you are.',
    "Good afternoon, {t}. I've been expecting you.",
    'Good afternoon, {t}. Shall we carry on?',
  ],
  evening: [
    'Good evening, {t}. At your service, as always.',
    'Good evening, {t}. Not too long tonight, I hope.',
    'Good evening, {t}. What can I do for you?',
    'Evening, {t}. The house is quiet; a good time to think.',
    'Good evening, {t}. I trust the day was kind to you.',
    'Good evening, {t}. Ready when you are.',
    "Good evening, {t}. Let's see what needs doing.",
  ],
  lateNight: [
    'Rather late to be starting, if I may. At your service all the same, {t}.',
    "Still up, {t}? Very well. I'll keep the lights on.",
    'A late shift, {t}. Let us make it a short one.',
    "Good evening, {t}, or what's left of it. How can I help?",
    "At this hour, {t}, I'd recommend brevity and then bed. But I'm listening.",
  ],
  smallHours: [
    "Burning the midnight oil again, {t}. I'll keep you company, but do remember the bed exists.",
    'The small hours, {t}. I am here, though I would much rather you were asleep.',
    "It's very late, {t}. One task, perhaps, and then rest?",
    'Up at this hour, {t}? Then we had better be quick about it.',
    "I'm at your service, {t}, though the clock and I both disapprove.",
  ],
  didntCatch: [
    "I'm afraid I didn't quite catch that, {t}.",
    'Forgive me, {t}, I missed that. Once more?',
    "I didn't quite hear you, {t}. Would you say it again?",
    'Pardon, {t}? That one escaped me.',
    'I beg your pardon, {t}; I lost the thread there.',
    "Not quite clear, I'm afraid, {t}. Again, if you would.",
  ],
  reminder: [
    'Pardon the interruption, {t}. You asked me to remind you: {what}.',
    'A gentle reminder, {t}: {what}.',
    'If I may, {t}, you wanted reminding: {what}.',
    "It's time, {t}. {What}.",
    'Excuse me, {t}. As requested: {what}.',
    'Your reminder, {t}: {what}.',
    'A word, {t}, as you asked: {what}.',
  ],
  reminderMissed: [
    'While you were away, {t}, I was to remind you: {what}.',
    'This came due in your absence, {t}: {what}.',
    'You missed one while you were out, {t}: {what}.',
    'A reminder that arrived before you did, {t}: {what}.',
  ],
  doneLong: [
    'All done, {t}. That took {took}.',
    'Finished, {t}, in {took}.',
    "That's seen to, {t}. {Took}, all told.",
    'Done and dusted, {t}. It took {took}.',
    'The task is complete, {t}, after {took}.',
    "There we are, {t}. {Took}, but it's finished.",
    'Complete, {t}. {Took} well spent, I hope.',
  ],
  setback: [
    "A slight setback, {t}. Nothing that can't be mended; the details are on screen.",
    "That didn't go to plan, {t}. The particulars are on screen.",
    "We've hit a snag, {t}. I've put the details up for you.",
    "Something went awry, {t}. Nothing irreparable; it's all on screen.",
    'A hitch, {t}, I am afraid. The details are on screen when you are ready.',
    'Not quite, {t}. It stumbled; the reason is on screen.',
  ],
  permission: [
    'Your permission, {t}, when you have a moment. {msg}',
    'I need your word on something, {t}. {msg}',
    'A decision for you, {t}. {msg}',
    'Before I go on, {t}, your approval, please. {msg}',
    "I'll wait for your say-so, {t}. {msg}",
  ],
  idle: [
    "I'm here whenever you're ready, {t}. No hurry.",
    'Standing by, {t}.',
    'Whenever you are ready, {t}.',
    "I'll be here, {t}.",
    'At your leisure, {t}.',
    'Take your time, {t}. I shan\'t wander off.',
  ],
  safety: [
    "If I may, {t}: this would {what}. I'd rather have your word before doing something we can't undo.",
    "A moment, {t}. This would {what}, and there's no taking it back. Shall I proceed?",
    "Before I do this, {t}: it would {what}. I'd like your say-so first.",
    'This would {what}, {t}. Not easily undone, so I await your word.',
    'I must check with you, {t}: this would {what}. Are you quite sure?',
  ],
  resume: [
    'Ah. Where was I, {t}?',
    'Now then, {t}, as I was saying.',
    'Forgive the interruption, {t}. To continue.',
    'Picking up where I left off, {t}.',
  ],
  test: [
    'Testing, {t}. You should be hearing me perfectly well.',
    'One, two, three, {t}. Loud and clear, I trust.',
    'Voice check, {t}. All in working order.',
    'Can you hear me, {t}? I can hear myself, which is a start.',
  ],
  updateReady: [
    'If I may, {t}: a newer version of me is ready, {version}.{news} Shall I install it?',
    'A small improvement awaits, {t}: version {version}.{news} Say the word and I shall install it.',
    "{T}, version {version} of myself has arrived.{news} Shall I see to it?",
    'There is an update for me, {t}, version {version}.{news} Would you like it installed?',
  ],
  updated: [
    "Installed, {t}. I'll be the better for it from your next session.",
    'The update is in, {t}. It takes effect when you next start a session.',
    "Done, {t}. A fresh coat of polish, ready from the next session.",
    'All installed, {t}. Start a new session and you will have the new me.',
  ],
} satisfies Record<string, readonly string[]>

export type PhraseKey = keyof typeof PHRASES

/** How many of the latest picks for a situation are avoided next time. */
export function avoidCount(poolSize: number): number {
  return Math.max(0, Math.min(Math.floor(poolSize / 2), poolSize - 1))
}

/** Picks an index not among the most recent ones; `rand` returns 0 ≤ x < 1. */
export function chooseIndex(poolSize: number, recent: readonly number[], rand: () => number = Math.random): number {
  if (poolSize <= 1) return 0
  const avoid = new Set(recent.slice(-avoidCount(poolSize)))
  const allowed = Array.from({ length: poolSize }, (_, i) => i).filter(i => !avoid.has(i))
  const from = allowed.length ? allowed : Array.from({ length: poolSize }, (_, i) => i)
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))]!
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Fills `{t}`, `{T}` and `{name}` / `{Name}` slots. */
export function fill(template: string, title: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (key === 't') return title
    if (key === 'T') return cap(title)
    const lower = key.charAt(0).toLowerCase() + key.slice(1)
    const v = vars[lower]
    if (v === undefined) return whole
    return key === lower ? v : cap(v)
  }).replace(/^\w/, c => c.toUpperCase())
}

/** The greeting's situation for an hour of the day (0–23). */
export function greetingKey(hour: number): PhraseKey {
  if (hour < 5) return 'smallHours'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'lateNight'
}

/** Remembered picks, per situation: { key: [indices, oldest first] }. */
export type RecentPicks = Partial<Record<PhraseKey, number[]>>

/** Chooses a wording, updates the remembered picks, and returns the filled line. */
export function phraseFrom(
  recent: RecentPicks,
  key: PhraseKey,
  title: string,
  vars: Record<string, string> = {},
  rand: () => number = Math.random,
): { line: string; recent: RecentPicks } {
  const pool = PHRASES[key]
  const past = recent[key] ?? []
  const i = chooseIndex(pool.length, past, rand)
  const kept = [...past, i].slice(-Math.max(1, avoidCount(pool.length)))
  return { line: fill(pool[i]!, title, vars), recent: { ...recent, [key]: kept } }
}
