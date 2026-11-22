# JARVIS for Claude Code

Turns Claude Code into JARVIS: a calm, dry-witted British AI butler that speaks.

- **Persona**: added to the system prompt. JARVIS calls you "sir" (configurable) and opens every reply with one spoken summary sentence.
- **Voice out**: that sentence is read aloud at the end of each turn.
- **Spoken alerts**: permission prompts and idle notices are announced.
- **Greeting**: a time-of-day greeting when a session starts.
- **/jarvis**: `/jarvis test`, `/jarvis say <text>`, `/jarvis mute`, `/jarvis unmute`.

## Voice engines

- **VoiceStudio** (default, free, local): install the VoiceStudio app and keep it running. JARVIS calls its OpenAI-compatible API at `http://127.0.0.1:3900/v1/audio/speech`. For a consistent voice, design or clone one in VoiceStudio, save it as a profile named `Jarvis` (the plugin's default voice), or set **VoiceStudio voice** to whatever name you chose.
- **ElevenLabs** (cloud): set **Voice engine** to `elevenlabs` and paste your API key.

Works on Windows (PowerShell playback), macOS (afplay) and Linux (paplay/aplay/ffplay).
