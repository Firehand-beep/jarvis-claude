// The JARVIS look for the desktop and mobile apps: deep navy panels, arc-reactor blue.
// Terminals draw no look; the status line is their HUD.
import type { ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

const { theme } = makeColors({
  label: 'JARVIS',
  only: 'dark',
  roles: { accent: '#38bdf8', danger: '#f0524f', success: '#3ecf8e', warning: '#f5b544', pro: '#a78bfa' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#070d17',
        'surface-1': '#0b1422',
        'surface-2': '#101b2c',
        'surface-3': '#142236',
        'text-primary': '#e6f4ff',
        'text-secondary': '#b5cde0',
        'text-muted': '#8aa6bd',
      },
    },
  },
})

export const LOOK: ThemeSetArgs = { colors: theme }
