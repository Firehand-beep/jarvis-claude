# JARVIS for Claude Code

A series of mods that turn Claude Code into JARVIS.

| Mod | Status | What it does |
|---|---|---|
| `jarvis` | v0.6.0 | Butler persona, spoken replies and alerts, built-in voice input (tap Space), hands-free dictation, interruptible speech, safety protocol, status-line HUD, spoken briefings and long-task alerts |

## Install

In a Claude Code terminal session:

```
/plugin install jarvis --marketplace Firehand-beep/jarvis-claude
```

From a shell:

```
claude plugin install jarvis --marketplace Firehand-beep/jarvis-claude
```

Update later with `/plugin update`.

## Requirements

- [VoiceStudio](https://github.com/debpalash/VoiceStudio) running locally (default voice engine), with a saved voice profile named `Jarvis`. Or switch the voice engine to ElevenLabs in the plugin settings.

See [plugins/jarvis/README.md](plugins/jarvis/README.md) for details.
