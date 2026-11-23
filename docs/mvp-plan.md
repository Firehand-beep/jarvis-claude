# Alfred MVP: build plan

**Goal:** a pitch-ready Alfred that runs entirely on the laptop, can be reached from the phone, and
can carry a three-minute live demo.
**Starting point:** v0.15.1 (voice in/out, Hub, memory, weather, Windows control, reminders).
**Rule for every phase:** built and unit-tested in the cloud, then tested on the laptop before it is
published. Nothing is called done until it has worked on the real PC.

---

## Phase 0: Check what is already built (laptop, ~30 min)

Before adding anything, confirm v0.15.x works on Windows.

- [ ] Update the plugin:
  `claude plugin marketplace update jarvis-claude; claude plugin update jarvis@jarvis-claude`
- [ ] `/alfred check`, then try: volume, media keys, screenshot, battery, lock screen.
- [ ] Set a two-minute reminder and confirm it fires and is spoken.
- [ ] Ask about the weather; confirm it is spoken, not only shown as text.
- [ ] Tell Alfred something to remember; start a new session; ask about it.
- [ ] Time a new session: the Hub should appear within a second or two.

**Install once, for later phases:**
- `winget install Python.Python.3.12`
- `py -m pip install sherpa-onnx numpy sounddevice`
- `winget install Gyan.FFmpeg`
- Telegram on the phone (for Phase 4).

---

## Phase 1: Voice ID (~1 session; about 70% built)

Alfred acts only on the owner's voice.

- `/alfred enroll`: you read four short sentences aloud, and Alfred builds a voiceprint. The voiceprint
  is a list of numbers, not a recording, and stays in `%USERPROFILE%\Alfred`.
- Every spoken command is checked before it is transcribed. If the voice is not the owner's, Alfred
  declines politely ("I'm afraid I only take instructions from the master of the house.").
- It fails closed: if Python or the model is missing, voice commands are refused and a short message
  explains why. Typed commands are unaffected.
- Settings: `voice_id` on/off, and a threshold (default 0.70) that is tuned after enrolment.
- The tests: speaker match, refusal, Python missing, enrolment flow.

**Already done:** `voiceid.py` (setup/enroll/verify). Its scores in testing: same speaker 0.86, another
person 0.60. The recorder changes are in `listen.ts`, still uncommitted.

**On the laptop:** enrol, then have a friend try. Adjust the threshold if needed.

---

## Phase 2: "What am I looking at?" (~0.5 session)

- Voice phrases ("what's on my screen", "explain this error", "read this to me") take a screenshot,
  and Alfred describes it aloud in two or three sentences.
- Option: capture only the active window, so a second monitor is not included.
- Privacy: screenshots are kept for a day and then deleted (configurable).

---

## Phase 3: Wake word, "Alfred…" (~1–1.5 sessions)

Hands-free listening.

- A small background listener runs on the laptop: the sherpa-onnx keyword spotter. It is open
  vocabulary, so "Alfred" or "Hey Alfred" works without training a model. openWakeWord is the
  fallback if accuracy is poor.
- On hearing the word: a soft chime, the Hub turns to "listening", and the normal recorder takes the
  command (with voice ID, when enabled). The listener pauses while Alfred is speaking, so he does not
  wake himself.
- Hub buttons: Wake word on/off. It also turns off automatically when the screen is locked.
- Everything runs locally. No audio leaves the laptop until a command is spoken.
- **Risk:** false wakes from TV or video calls. Mitigated by voice ID plus a sensitivity setting.

---

## Phase 4: Phone link through Telegram (~2 sessions)

Message Alfred from anywhere; he answers in his own voice.

**How it works:**
1. You create a free bot with @BotFather in Telegram. The bot token goes into
   `/plugin configure` (secure storage), never into chat.
2. `/alfred phone pair` shows a six-digit code. Sending it to the bot links your Telegram account.
   Alfred then ignores everyone else.
3. Alfred checks Telegram every few seconds from the laptop. No server and no open ports are needed;
   it only makes outgoing requests.
4. A text or **voice note** from the phone goes into the live session as your request (voice notes are
   transcribed locally with VoiceStudio).
5. The reply comes back as text plus a **voice note in Alfred's voice** (converted to Telegram's
   format with FFmpeg). Screenshots come back as photos.
6. **Confirmation on the phone:** anything the safety protocol would normally ask about (deleting
   files, risky commands) arrives as a Telegram message with **Allow / Deny** buttons. If there is no
   answer within two minutes, the action is denied.
7. Reminders and nudges are also sent to the phone when the laptop has been idle for a while.

**Commands from the phone:** anything you can say to Alfred, plus `/status`, `/screenshot`,
`/lock`, `/stop`.

**Requirements:** the laptop must stay on and awake, with Claude open. Alfred sets Windows to stay
awake while plugged in, if you allow it.

**Risks to check on the laptop:**
- whether VoiceStudio accepts Telegram's OGG audio directly (otherwise FFmpeg converts it first);
- that Windows sleep settings do not cut the link.

**Also available without building:** Remote Control. Run `claude remote-control` on the laptop and
pick the session in the Claude app's Code tab.

---

## Phase 5: Spoken morning briefing (~1 session; optional for the pitch)

"Good morning, Alfred" gets you the weather, today's meetings, important unread email and today's
reminders, in under 45 seconds.

- **Needs:** your calendar and email connected (Outlook or Gmail). You choose which account.
- Can be scheduled as a daily reminder at a set time, delivered to the laptop or the phone.
- Without connectors it still works with weather, reminders and battery.

---

## Phase 6: Pitch polish (~1 session)

- **Demo mode:** a clean Hub, no personal notes on screen, and canned fallbacks if Wi-Fi fails
  (a recorded backup video).
- **The three-minute script:**
  1. From across the room: "Alfred, good morning." (wake word plus briefing)
  2. A friend gives a command and is declined; you repeat it and it is done. (voice ID)
  3. "Alfred, what's this error?" (screen awareness)
  4. From the phone: send a voice note, "Lock my laptop." It locks, and the voice reply arrives. (phone link)
  5. Close: "It runs on my laptop. The voice and voice ID never leave it."
- Rehearse three times. Record one clean run as a backup.

---

## Order and estimate

| # | Phase | Sessions | Needs the laptop for |
|---|---|---|---|
| 0 | Check v0.15 | 0.5 | everything |
| 1 | Voice ID | 1 | enrolment, threshold |
| 2 | Screen awareness | 0.5 | a test run |
| 3 | Wake word | 1–1.5 | mic, false-wake tuning |
| 4 | Phone (Telegram) | 2 | the bot token, a voice-note test |
| 5 | Briefing | 1 | connecting calendar and email |
| 6 | Pitch polish | 1 | rehearsal |
| | **Total** | **~7–8 sessions** | roughly 2 weeks at a relaxed pace |

**Can be done without the laptop:** code and tests for Phases 1–4 (built here, published but marked
untested), the demo script, and the pitch deck.

## Decisions still open

1. The wake phrase: "Alfred" (fast, more false wakes) or "Hey Alfred" (safer). Suggested: "Hey Alfred".
2. Whether the phone link stays Telegram or moves to WhatsApp later (slower to set up).
3. Which calendar and email account the briefing uses: Outlook or Gmail.
