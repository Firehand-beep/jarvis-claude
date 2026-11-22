# JARVIS for Claude Code

Turns Claude Code into JARVIS: an old-school English family butler (devoted, dry, gently protective) who runs your machines and speaks.

- **Persona**: an old-school family butler, warm under a formal manner, with understated wit and a habit of noticing when you work too late. JARVIS calls you "sir" (configurable: **How JARVIS addresses you**, e.g. "Master" and your first name) and opens every reply with one spoken summary sentence.
- **Voice out**: that sentence is read aloud at the end of each turn.
- **Spoken alerts**: permission prompts and idle notices are announced.
- **Greeting**: a time-of-day greeting when a session starts.
- **Voice input (Windows)**: press **Ctrl+Space** anywhere (it is held system-wide on Windows, so it works in the desktop app, the terminal and other apps), click **Listen** in the Hub, or run `/listen`. After a short beep, speak; JARVIS stops recording when you stop talking, VoiceStudio transcribes it locally (the speech-recognition model selected in VoiceStudio under Settings → Models → ASR), and the prompt is sent. Press Ctrl+Space again, or type anything, to cancel. With a draft already in the prompt, what you say is added to the draft instead of sent. The **Talk key** setting takes another combination (`ctrl+shift+space`, `alt+j`, `ctrl+f9`…), or `space` for plain Space in an empty prompt (terminal only), or `both`. If another app already holds the key, `/jarvis status` and the Hub say so. If the speech model needs its licence accepted, JARVIS says so; `/jarvis accept-licences` accepts it. Settings: **Voice input**, **Talk key**, **Voice input language** (default `en`).
- **Hands-free (VoiceStudio dictation)**: with VoiceStudio dictation (Settings → Hotkey, default Ctrl+Shift+Space), a spoken sentence pasted into an empty prompt is sent automatically and acknowledged ("Right away, sir."). Pasted code, links or multi-line text are never auto-sent. Turn off with the **Auto-send dictation** setting.
- **Interruptible**: typing or pasting silences JARVIS at once; `/jarvis stop` does too.
- **Safety protocol**: before a destructive shell command (deleting folders, force-push, hard reset, dropping tables, deploying, publishing, formatting) JARVIS says what it would do and Claude Code asks you, even in auto mode. `/jarvis check <command>` shows whether a command is on the list. Setting: **Safety protocol**.
- **JARVIS Hub** (Claude desktop app): a designed 440 × 640 HUD panel beside the chat. A holographic gyroscope reactor coloured by state (blue standing by, teal listening, amber working, light blue speaking, red error), context and 5-hour-limit gauge arcs, VOICE / MIC / talk-key status, last task time, branch and changes, the safety card when a command is held, and the last eight lines of conversation, with Listen / Stop / Mute / Brief buttons underneath. Opens with each session (setting: **JARVIS Hub panel**) or with `/jarvis hub`; terminals show a text version.
- **HUD**: the status line shows `◉ JARVIS · ctx 34% · 5h 12% · ⎇ main` (context used, 5-hour usage limit or estimated cost, git branch). In the Claude desktop and mobile apps, a navy and arc-reactor blue look (setting: **JARVIS look**).
- **Briefings**: a spoken report when a session starts (date on the first session of the day, branch, uncommitted changes); `/jarvis brief` repeats it. Tasks that take a minute or more (setting: **Long task alert**) are announced when they finish, with a notification.
- **/jarvis**: `hub`, `stop`, `brief`, `test`, `status`, `check <command>`, `say <text>`, `mute`, `unmute`.

## Voice engines

- **VoiceStudio** (default, free, local): install the VoiceStudio app and keep it running. JARVIS calls its OpenAI-compatible API at `http://127.0.0.1:3900/v1/audio/speech`. For a consistent voice, design or clone one in VoiceStudio, save it as a profile named `Jarvis` (the plugin's default voice), or set **VoiceStudio voice** to whatever name you chose.
- **ElevenLabs** (cloud): set **Voice engine** to `elevenlabs` and paste your API key.

Works on Windows (PowerShell playback), macOS (afplay) and Linux (paplay/aplay/ffplay).
