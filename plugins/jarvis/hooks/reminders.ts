// Reminders and timers: kept in the plugin's store, checked every few seconds while a session is open.

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly'
export type Reminder = {
  id: string
  /** What to say, or (when `ask`) the request to put to Alfred. */
  text: string
  /** When it is due, ms since the epoch. */
  due: number
  repeat: Repeat
  /** True: when due, the text is sent to Alfred as a request ("give me my morning briefing"). */
  ask: boolean
  created: number
}

/**
 * When a new reminder is first due. `inMinutes` wins; else `at` as "HH:MM" (today, or tomorrow if
 * past) or a local date-time "YYYY-MM-DD HH:MM" / "YYYY-MM-DDTHH:MM".
 */
export function firstDue(now: Date, inMinutes: number | undefined, at: string | undefined, repeat: Repeat): number | string {
  if (typeof inMinutes === 'number' && Number.isFinite(inMinutes) && inMinutes > 0) return now.getTime() + Math.round(inMinutes * 60_000)
  const spec = (at ?? '').trim()
  let m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(spec)
  if (m) {
    let h = Number(m[1])
    const min = Number(m[2])
    const ampm = m[3]?.toLowerCase()
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    if (h > 23 || min > 59) return `"${spec}" is not a time of day.`
    const d = new Date(now)
    d.setHours(h, min, 0, 0)
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
    return skipToAllowed(d, repeat).getTime()
  }
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(spec)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0)
    if (d.getTime() <= now.getTime()) return `${spec} has already passed.`
    return d.getTime()
  }
  return 'Give either in_minutes, or at as "HH:MM" or "YYYY-MM-DD HH:MM" (local time).'
}

/** Weekday reminders skip Saturday and Sunday. */
function skipToAllowed(d: Date, repeat: Repeat): Date {
  if (repeat !== 'weekdays') return d
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

/** The next time a repeating reminder is due after it fired; undefined when it does not repeat. */
export function nextDue(r: Reminder, now: number): number | undefined {
  if (r.repeat === 'none') return undefined
  const d = new Date(r.due)
  do {
    d.setDate(d.getDate() + (r.repeat === 'weekly' ? 7 : 1))
    skipToAllowed(d, r.repeat)
  } while (d.getTime() <= now)
  return d.getTime()
}

export function whenText(due: number, now: number): string {
  const d = new Date(due)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const today = new Date(now)
  const tomorrow = new Date(now + 86_400_000)
  if (d.toDateString() === today.toDateString()) return `today at ${hhmm}`
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${hhmm}`
  return `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} at ${hhmm}`
}

export function describeReminder(r: Reminder, now: number): string {
  const rep = r.repeat === 'none' ? '' : `, repeating ${r.repeat === 'weekdays' ? 'on weekdays' : r.repeat}`
  return `[${r.id}] ${r.ask ? 'request' : 'reminder'} "${r.text}", ${whenText(r.due, now)}${rep}`
}
