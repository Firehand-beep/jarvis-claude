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

## Phase 3: Wake word, "Hello Alfred" (~1–1.5 sessions)

Hands-free listening.

- A small background listener runs on the laptop: the sherpa-onnx keyword spotter. It is open
  vocabulary, so the chosen phrase, **"Hello Alfred"**, works without training a model. The phrase is
  a setting and can be changed later. openWakeWord is the
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
3. Telegram messages arrive at **Alfred lite** (Phase 4b), and the laptop collects its jobs from
   Alfred lite every few seconds. Telegram can deliver to only one place, so everything goes through
   Alfred lite. No open ports are needed on the laptop; it only makes outgoing requests.
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

**Use Remote Control alongside it (no building needed):** run `claude remote-control` on the laptop,
or turn on Settings → Claude Code → Remote Control in the desktop app. Then pick the session in the
Claude app's Code tab.
- Remote Control: proper work (code, long tasks, the Hub on the phone).
- Telegram: quick requests on the go, voice notes and notifications.

---

## Phase 4b: Alfred lite, always on in the cloud (~1.5 sessions; buildable without the laptop)

Keeps Alfred reachable when the laptop is off.

**Where it runs:** a Cloudflare Worker, on the free plan: 100,000 requests a day, with storage and
timers included.

**What it does:**
- Receives all Telegram messages. If the laptop is awake, it passes requests to full Alfred.
- If the laptop is asleep, it answers itself: questions, weather, reminders and your notes.
- Laptop jobs are queued ("Your laptop is asleep, sir; I'll lock it when it wakes").
- Voice notes are transcribed in the cloud with Cloudflare's Whisper, within the free daily units.
- Reminders fire from the cloud, so they reach the phone even when the laptop is shut.
- Notes sync from the laptop to the Worker's storage on your Cloudflare account (optional; Alfred
  lite also works without your notes).

**Voice when the laptop is off:** text replies by default. Voice is optional, through ElevenLabs
(limited monthly characters) or a free plainer cloud voice.

**To do (you, from the phone):**
- [ ] Create a Cloudflare account (free).
- [ ] Create an Anthropic API account at platform.claude.com. Top up US$5, or claim the free
      US$5 by verifying your phone number.
- [ ] Create the Telegram bot with @BotFather.
- [x] Model chosen: Sonnet 5.5 at low effort (about US$2–5 a month). The model name is a setting,
      so it can drop to Haiku 5.5 if costs ever matter.
- [ ] Give Alfred a Cloudflare access token through the secure credential form. Keys never go into chat.

**To do (Alfred):**
- [ ] Build the Worker: Telegram webhook, pairing, laptop job queue, an online/offline heartbeat,
      cloud reminders, Whisper transcription, and Claude replies with weather, reminder and note tools.
- [ ] Deploy it from the cloud session.
- [ ] Laptop side (needs the laptop): heartbeat, collecting jobs, sending results back, note sync.

**Cost:** about US$0–1 a month, plus Claude API use.

---

## Phase 4c: WhatsApp, sending messages as you (~1 session)

Official routes only: nothing that risks a ban on your number.

**A. Tap-to-send links (works with the laptop off, through Alfred lite)**
- "Tell Mum I'll be home by 8." Alfred reads back the recipient and the wording, then waits for
  your "yes".
- He then sends a `wa.me` link in Telegram. Tapping it opens WhatsApp with the message ready, and you
  press Send.
- Individual chats only; links cannot open group chats.

**B. Alfred sends through WhatsApp Desktop (on the laptop)**
- "Alfred, WhatsApp Jason: running ten minutes late." He reads it back and waits for "yes".
- He opens WhatsApp Desktop on the chat (`whatsapp://send?phone=…&text=…`), sends the message, and
  takes a screenshot to confirm it went.
- Group chats work here.

**Safeguards (both):**
- Always reads back the recipient and the exact text; nothing is sent without your "yes".
- A contacts list (name to number) in Alfred's notes: "Alfred, Mum's number is …".
- If two contacts match a name, he asks which one.

**Not doing:** unofficial WhatsApp Web bridges (reading chats, auto-replies). They break WhatsApp's
terms and can get the number banned. Only reconsider with a spare number.

**To do:**
- [ ] Install WhatsApp Desktop on the laptop and sign in.
- [ ] Add your main contacts to Alfred's notes.
- [ ] Alfred: build A with Alfred lite, then B on the laptop.

---

## Phase 4d: People book, looking after your relationships (~1.5 sessions)

Alfred keeps track of the people in your life and helps you stay a good friend, son and colleague.

**What he keeps, for each person (one file per person in `%USERPROFILE%\Alfred\people\`):**
- Name, nicknames, how you know them (family, friend, work), phone number (shared with Phase 4c).
- Birthday, anniversary and other important dates.
- Their partner's and children's names, likes and dislikes, food and allergies, hobbies.
- Gift ideas, and gifts already given (so nothing is repeated).
- What is going on in their life ("starting a new job in March", "mum in hospital").
- When you last spoke or met.

**How you fill it:**
- Just tell him: "Alfred, Jason's birthday is 14 March, and he's mad about cycling." He files it.
- After meeting someone: "Had lunch with Sarah, she's moving to Melbourne." He updates her page and
  the last-contact date.
- Optional import: your phone contacts (a vCard export) or Google Contacts, to start with names,
  numbers and birthdays.

**What he does with it:**
- **Birthday care:** a heads-up seven days before ("Jason's birthday is next Friday; shall I suggest
  a gift?"), and on the morning itself, with a drafted message ready to send by WhatsApp (4c).
- **Gift ideas:** suggestions drawn from what he knows they like, within a budget you give.
- **Keeping in touch:** a gentle nudge when someone close hasn't been contacted for a while ("It's
  been five weeks since you spoke to your grandmother, sir"). You set how often for each person, or
  turn it off.
- **Before you meet someone:** "Alfred, I'm seeing Sarah tonight." He reminds you what's new with
  her and what to ask about.
- **In the morning briefing:** today's birthdays and anyone worth a call.

**Rules:**
- Kept on the laptop, like the rest of his memory. Nothing is deleted unless you ask
  (`/alfred forget`).
- Only birthdays and names sync to Alfred lite (so reminders work with the laptop off), and only if
  you allow it.
- He never contacts anyone by himself; every message waits for your "yes".
- Other people's details are kept discreetly: never shown in demo mode, and never sent anywhere
  except Claude, to answer your own requests.

**To do:**
- [ ] Alfred: build the people book (tools to add, update, look up and list upcoming dates), the
      birthday and keep-in-touch reminders, and the drafted messages.
- [ ] You: export your phone contacts (optional) and tell Alfred about the people who matter most.
- [ ] Decide: how far ahead birthday warnings come (suggested: 7 days and on the day), and the
      default keep-in-touch interval for close family and friends (suggested: monthly).

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
  1. From across the room: "Hello Alfred… good morning." (wake word plus briefing)
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
| 4 | Phone (Telegram plus Remote Control) | 2 | a voice-note test, laptop job collection |
| 4b | Alfred lite (cloud) | 1.5 | only the laptop half |
| 4c | WhatsApp sending | 1 | WhatsApp Desktop test |
| 4d | People book | 1.5 | importing contacts |
| 5 | Briefing | 1 | connecting calendar and email |
| 6 | Pitch polish | 1 | rehearsal |
| | **Total** | **~12 sessions** | roughly 3 weeks at a relaxed pace |

**Can be done without the laptop:** Alfred lite (4b) and WhatsApp links (4c A) can be built and
deployed in full; code and tests for Phases 1–4 can be written (published, but marked untested);
the demo script and the pitch deck.

## Decisions still open

1. ~~The wake phrase~~ **Decided: "Hello Alfred".**
2. ~~The model for Alfred lite~~ **Decided: Sonnet 5.5 at low effort** (about US$2–5 a month; can be switched to Haiku 5.5 with one setting).
3. Which calendar and email account the briefing uses: Outlook or Gmail.
4. Whether to sync your notes to Cloudflare (needed for Alfred lite to know them).
