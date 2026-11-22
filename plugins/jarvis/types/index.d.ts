/** One line in the hub's log: something JARVIS said, or something you said to it. */
export type HubLine = { who: 'jarvis' | 'you'; text: string; at: number }

export type MicPhase = 'idle' | 'warming' | 'listening' | 'hearing' | 'transcribing'

/** What the JARVIS Hub panel shows. */
export type HubState = {
  mic: MicPhase
  speaking: boolean
  working: boolean
  turnStartedAt: number | null
  lastTaskMs: number | null
  blocked: { what: string; command: string; at: number } | null
  voiceError: string | null
  log: HubLine[]
}

declare module 'claude-code' {
  interface PluginState {
    jarvis: { hub: Shaped<HubState> }
  }
}
