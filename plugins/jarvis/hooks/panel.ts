// The JARVIS Hub panel, after the approved design (440 x 640 SVG; the button row is drawn by the
// app underneath). panelSvg() fills the design with live data: the state class, the dots, the
// gauge arcs, the text fields and the log, as the design's build notes describe.

export type PanelState = 'standby' | 'listening' | 'working' | 'speaking' | 'error'
export type PanelLine = { who: 'jarvis' | 'you'; time: string; text: string }
export type PanelView = {
  state: PanelState
  /** STANDING BY, LISTENING, HEARING YOU, TRANSCRIBING, WORKING · SINCE 14:02, SPEAKING, VOICE ERROR, MUTED */
  label: string
  voiceOn: boolean
  micLive: boolean
  hotkey: { label: string; ready: boolean } | null
  ctxPct: number | null
  limitPct: number | null
  lastTask: string
  branch: string
  gitStatus: string
  safety: { reason: string; cmd: string } | null
  /** Newest last. */
  log: PanelLine[]
}

const TEMPLATE = String.raw`<svg id="jarvis-panel" class="state-standby voice-on" xmlns="http://www.w3.org/2000/svg" width="440" height="640" viewBox="0 0 440 640" role="img" aria-label="JARVIS status panel">
<!-- JARVIS Hub panel · standing-by version. Swap classes on #jarvis-panel: state-standby|state-listening|state-working|state-speaking|state-error, plus voice-on, mic-live, has-safety, log-collapsed. -->
<style>
.t{font-family:Bahnschrift,'Segoe UI',system-ui,sans-serif}
.m{font-family:Consolas,'Cascadia Mono','Courier New',monospace}
.fs9{font-size:9px}.fs10{font-size:10px}.fs11{font-size:11px}.fs12{font-size:12px}.fs13{font-size:13px}.fs17{font-size:17px}.fs20{font-size:20px}.fs22{font-size:22px}.fs24{font-size:24px}.fs26{font-size:26px}
.fw3{font-weight:300}.fw6{font-weight:600}
.ls1{letter-spacing:1px}.ls15{letter-spacing:1.5px}.ls2{letter-spacing:2px}.ls3{letter-spacing:3px}.ls6{letter-spacing:6px}.ls9{letter-spacing:9px}
.ta-m{text-anchor:middle}.ta-e{text-anchor:end}
.w1{stroke-width:1}.w15{stroke-width:1.5}.w2{stroke-width:2}.w3{stroke-width:3}.w4{stroke-width:4}.w5{stroke-width:5}
.dtick{stroke-dasharray:1.5 4}.dtick2{stroke-dasharray:1 3}.ddot{stroke-dasharray:2 4}.ddash{stroke-dasharray:7 5}.dbar{stroke-dasharray:9 3}
.o04{opacity:.05}.o15{opacity:.15}.o2{opacity:.2}.o25{opacity:.28}.o3{opacity:.3}.o4{opacity:.4}.o5{opacity:.5}.o6{opacity:.6}.o7{opacity:.7}.o8{opacity:.8}.o9{opacity:.9}
.chipbox{fill-opacity:.07;stroke-opacity:.55}
.sacc{stop-color:currentColor}.so0{stop-opacity:0}.so05{stop-opacity:.04}.so15{stop-opacity:.16}.so6{stop-opacity:.6}.so9{stop-opacity:.95}

/* state colour: swap the class on #jarvis-panel */
#jarvis-panel{color:#38bdf8}
#jarvis-panel.state-standby{color:#38bdf8}#jarvis-panel.state-listening{color:#5eead4}#jarvis-panel.state-working{color:#f5b544}#jarvis-panel.state-speaking{color:#7dd3fc}#jarvis-panel.state-error{color:#f0524f}
/* status dots */
.voice-on #dot-voice,.mic-live #dot-mic{fill:currentColor}
/* state effects */
.state-listening #fx-listen,.state-working #fx-work,.state-speaking #fx-speak,.state-error #fx-error{display:inline}
/* safety hold: card shows, log loses its 3 oldest lines */
.has-safety #safety{display:inline}.has-safety #log-older{display:none}
.has-safety #log-header,.has-safety #log-latest{transform:none}
/* collapsed log: set viewBox height to 494 (560 with safety) */
.log-collapsed #log{display:none}.log-collapsed #log-latest{display:inline}
/* motion */
@keyframes jh-spin{to{transform:rotate(360deg)}}
@keyframes jh-spin-r{to{transform:rotate(-360deg)}}
@keyframes jh-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes jh-beat{0%{transform:scale(.94);opacity:.55}100%{transform:scale(1.08);opacity:1}}
@keyframes jh-ripple{0%{transform:scale(.45);opacity:.95}100%{transform:scale(1.25);opacity:0}}
#reactor-rings,#reactor-orbits,#reactor-core,#fx-listen,.ripple{transform-box:view-box;transform-origin:220px 212px}
#reactor-rings{animation:jh-spin-r 60s linear infinite}
#reactor-orbits{animation:jh-spin 40s linear infinite}
#reactor-core{animation:jh-pulse 4s ease-in-out infinite}
.state-listening #fx-listen{animation:jh-beat 1.2s ease-in-out infinite alternate}
.state-working #reactor-orbits{animation-duration:10s}
.state-working #reactor-rings{animation-duration:20s}
.state-speaking #reactor-orbits{animation-duration:14s}
.state-speaking #reactor-rings{animation-duration:30s}
.state-speaking #reactor-core{animation:jh-pulse .5s ease-in-out infinite}
.ripple{animation:jh-ripple 1.5s ease-out infinite}.rd2{animation-delay:-.5s}.rd3{animation-delay:-1s}
@media (prefers-reduced-motion: reduce){#jarvis-panel *{animation:none !important}}
</style>
<defs>
<filter id="jh-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="b"></feGaussianBlur><feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>
<filter id="jh-bloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7"></feGaussianBlur></filter>
<radialGradient id="jh-core"><stop offset="0" stop-color="#ffffff"></stop><stop offset="0.35" stop-color="#ffffff" class="so9"></stop><stop offset="0.7" class="sacc so6"></stop><stop offset="1" class="sacc so0"></stop></radialGradient>
<radialGradient id="jh-bg"><stop offset="0" class="sacc so15"></stop><stop offset="1" class="sacc so0"></stop></radialGradient>
<linearGradient id="jh-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sacc so6"></stop><stop offset="1" class="sacc so05"></stop></linearGradient>
<pattern id="jh-scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity="0.025"></rect></pattern>
<pattern id="jh-haz" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#f5b544"></rect></pattern>
</defs>
<rect width="440" height="640" fill="#050b14"></rect>
<text x="220" y="34" class="t fs13 ls4 fw6 ta-m" fill="currentColor" id="state">STANDING BY</text><line x1="20" y1="29" x2="90" y2="29" stroke="currentColor" class="w1 o4"></line><line x1="350" y1="29" x2="420" y2="29" stroke="currentColor" class="w1 o4"></line>
<g id="reactor"><circle cx="220" cy="212" r="189.0" fill="url(#jh-bg)"></circle>
<g id="reactor-rings"><path d="M187.4 333.7 A126 126 0 0 1 98.3 244.6" class="w2 o8" stroke="currentColor" fill="none"></path><path d="M98.3 179.4 A126 126 0 0 1 166.8 97.8" class="w2 o8" stroke="currentColor" fill="none"></path><path d="M174.3 86.5 A133.56 133.56 0 0 1 215.3 78.5" class="w2 o6" stroke="currentColor" fill="none"></path><path d="M275.4 93.2 A131.04 131.04 0 0 1 323.3 131.3" class="w5" stroke="currentColor" fill="none" filter="url(#jh-glow)"></path><path d="M349.0 189.2 A131.04 131.04 0 0 1 344.6 252.5" class="w4 o9" stroke="currentColor" fill="none"></path><path d="M333.5 277.5 A131.04 131.04 0 0 1 300.7 315.3" class="w5 dbar" stroke="currentColor" fill="none" filter="url(#jh-glow)"></path><circle cx="220" cy="212" r="115.92" class="w5 dtick o7" stroke="currentColor" fill="none"></circle><circle cx="220" cy="212" r="103.32" class="w15" stroke="currentColor" fill="none" filter="url(#jh-glow)"></circle><circle cx="220" cy="212" r="93.24" class="w1 ddot o5" stroke="currentColor" fill="none"></circle></g><ellipse id="reactor-equator" cx="220" cy="219.56" rx="100.80000000000001" ry="34.02" class="w15 ddash o8" stroke="currentColor" fill="none"></ellipse>
<g id="reactor-orbits">
<g id="reactor-orbit-1" transform="rotate(-35 220 212)"><ellipse cx="220" cy="212" rx="75.6" ry="26.459999999999997" class="w2" stroke="currentColor" fill="none" filter="url(#jh-glow)"></ellipse><circle cx="144.4" cy="212" r="5.67" fill="#050b14" stroke="#e6f7ff" class="w15"></circle><circle cx="295.6" cy="212" r="5.67" fill="#050b14" stroke="#e6f7ff" class="w15"></circle></g>
<g id="reactor-orbit-2" transform="rotate(58 220 212)"><ellipse cx="220" cy="212" rx="75.6" ry="26.459999999999997" class="w2" stroke="currentColor" fill="none" filter="url(#jh-glow)"></ellipse><circle cx="144.4" cy="212" r="5.67" fill="#050b14" stroke="#e6f7ff" class="w15"></circle><circle cx="295.6" cy="212" r="5.67" fill="#050b14" stroke="#e6f7ff" class="w15"></circle></g>
<g id="reactor-orbit-3" transform="rotate(12 220 212)"><ellipse cx="220" cy="212" rx="75.6" ry="26.459999999999997" class="w2 ddash o8" stroke="currentColor" fill="none" filter="url(#jh-glow)"></ellipse><circle cx="144.4" cy="212" r="5.67" fill="#050b14" stroke="#e6f7ff" class="w15"></circle><circle cx="295.6" cy="212" r="5.67" fill="#050b14" stroke="#e6f7ff" class="w15"></circle></g></g><circle cx="220" cy="212" r="52.919999999999995" fill="currentColor" opacity="0.55" filter="url(#jh-bloom)"></circle><circle id="reactor-core" cx="220" cy="212" r="45.36" fill="url(#jh-core)"></circle><circle cx="220" cy="212" r="39.06" class="w1 o4" stroke="#ffffff" fill="none"></circle></g>
<g id="fx-listen" display="none"><circle cx="220" cy="212" r="63.0" class="w15 o7" stroke="currentColor" fill="none"></circle><circle cx="220" cy="212" r="78.12" class="w1 o4" stroke="currentColor" fill="none"></circle></g>
<g id="fx-speak" display="none" filter="url(#jh-glow)"><circle cx="220" cy="212" r="88.19999999999999" class="w2 ripple rd1" stroke="currentColor" fill="none"></circle><circle cx="220" cy="212" r="88.19999999999999" class="w2 ripple rd2" stroke="currentColor" fill="none"></circle><circle cx="220" cy="212" r="88.19999999999999" class="w2 ripple rd3" stroke="currentColor" fill="none"></circle><circle cx="220" cy="212" r="63.0" fill="currentColor" opacity="0.3" filter="url(#jh-bloom)"></circle></g>
<g id="fx-work" display="none" filter="url(#jh-glow)"><circle cx="285.5" cy="225.2" r="2.6" fill="#ffffff" transform="rotate(-35 220 212)"></circle><circle cx="149.0" cy="203.0" r="2.6" fill="#ffffff" transform="rotate(-35 220 212)"></circle><circle cx="182.2" cy="234.9" r="2.6" fill="#ffffff" transform="rotate(58 220 212)"></circle><circle cx="245.9" cy="187.1" r="2.6" fill="#ffffff" transform="rotate(58 220 212)"></circle><circle cx="239.6" cy="237.6" r="2.6" fill="#ffffff" transform="rotate(12 220 212)"></circle><circle cx="194.1" cy="187.1" r="2.6" fill="#ffffff" transform="rotate(12 220 212)"></circle></g>
<g id="fx-error" display="none"><circle cx="220" cy="212" r="63.0" class="w2" stroke="currentColor" fill="none" style="stroke-dasharray: 18 10 4 10"></circle></g><path d="M77.5 331.6 A186 186 0 0 1 77.5 92.4" class="w4 o15" stroke="currentColor" fill="none"></path><path d="M77.5 331.6 A186 186 0 0 1 34.0 212.0" class="w4" stroke="currentColor" fill="none" filter="url(#jh-glow)" id="ctx-arc"></path><path d="M72.2 336.1 A193 193 0 0 1 72.2 87.9" class="w1 dtick2 o5" stroke="currentColor" fill="none"></path><path d="M362.5 331.6 A186 186 0 0 0 362.5 92.4" class="w4 o15" stroke="currentColor" fill="none"></path><path d="M362.5 331.6 A186 186 0 0 0 406.0 214.6" class="w4" stroke="currentColor" fill="none" filter="url(#jh-glow)" id="limit-arc"></path><path d="M367.8 336.1 A193 193 0 0 0 367.8 87.9" class="w1 dtick2 o5" stroke="currentColor" fill="none"></path><circle id="dot-voice" cx="128" cy="392" r="3.5" stroke="currentColor" fill="none" class="w15" filter="url(#jh-glow)"></circle>
<text x="137" y="395.5" class="t fs9 ls15" fill="#7f9bb8" id="lbl-voice">VOICE</text><circle id="dot-mic" cx="206" cy="392" r="3.5" stroke="currentColor" fill="none" class="w15" filter="url(#jh-glow)"></circle>
<text x="215" y="395.5" class="t fs9 ls15" fill="#7f9bb8" id="lbl-mic">MIC</text><circle id="dot-hotkey" cx="268" cy="392" r="3.5" stroke="currentColor" fill="currentColor" class="w15" filter="url(#jh-glow)"></circle>
<text x="277" y="395.5" class="t fs9 ls15" fill="#7f9bb8" id="lbl-hotkey">CTRL+SPACE</text><rect x="20" y="408" width="400" height="38" fill="currentColor" class="o04"></rect><rect x="20.5" y="408.5" width="399" height="37" stroke="currentColor" fill="none" class="w1 o25"></rect><path d="M20 416 V408 H28 M412 408 H420 V416 M420 438 V446 H412 M28 446 H20 V438" class="w15 o9" stroke="currentColor" fill="none"></path>
<g transform="translate(36 420)" stroke="currentColor" fill="none" class="w15"><circle cx="7" cy="7" r="5.5"></circle><path d="M7 4v3.2l2 1.3"></path></g>
<text x="58" y="432" class="t fs13" fill="#d6ecff" id="last-task">1m 42s</text><line x1="155" y1="418" x2="155" y2="436" stroke="currentColor" class="w1 o25"></line>
<g transform="translate(169 420)" stroke="currentColor" fill="none" class="w15"><path d="M4 2.5v9 M4 11.5a1.8 1.8 0 1 0 .01 0 M10.5 4.2a1.8 1.8 0 1 0 .01 0 M10.5 6c0 3.5-6.5 2.5-6.5 5.5"></path></g>
<text x="191" y="432" class="m fs12" fill="#d6ecff" id="git-branch">main</text><line x1="288" y1="418" x2="288" y2="436" stroke="currentColor" class="w1 o25"></line>
<g transform="translate(302 420)" stroke="#f5b544" fill="none" class="w15"><path d="M3.5 1.5h5l3 3v8h-8Z M7 6v4 M5 8h4"></path></g>
<text x="324" y="432" class="t fs13" fill="#f5b544" id="git-status">3 changes</text>
<g id="safety" display="none"><rect x="20" y="456" width="400" height="48" fill="#f0524f" opacity="0.09"></rect><rect x="20.5" y="456.5" width="399" height="47" stroke="#f0524f" fill="none" class="w1 o7"></rect><rect x="20" y="456" width="6" height="48" fill="url(#jh-haz)"></rect>
<g transform="translate(36 462)" stroke="#f0524f" fill="none" class="w15"><path d="M7 1.5l6 11H1Z M7 5.5v3.2 M7 10.6v.4"></path></g>
<text x="56" y="473" class="t fs12" fill="#ffd6d3" id="safety-reason">Held 14:05 · deletes a folder and its contents</text>
<text x="36" y="494" class="m fs11" fill="#f5b544" id="safety-cmd">Remove-Item C:\work -Recurse -Force</text></g>
<g id="log" display="inline">
<g id="log-header" transform="translate(0 -66)"><line x1="20" y1="518" x2="388" y2="518" stroke="currentColor" class="w1 o25"></line><line x1="20" y1="518" x2="60" y2="518" stroke="currentColor" class="w2 o8"></line>
<g id="log-toggle-collapse" display="none"><circle cx="406" cy="518" r="11" fill="currentColor" stroke="currentColor" class="w1 chipbox"></circle><path d="M401 520.5 L406 515.5 L411 520.5" stroke="currentColor" fill="none" class="w2"></path></g></g>
<text x="32" y="622" class="m fs10" fill="#7f9bb8" id="log-1-time">14:06</text><path d="M66 614 l5 4 l-5 4" stroke="#5eead4" fill="none" class="w15"></path>
<text x="80" y="622" class="t fs12" fill="#5eead4" id="log-1">Leave it for now.</text>
<text x="32" y="600" class="m fs10" fill="#7f9bb8" id="log-2-time">14:06</text><path d="M66 592 l5 4 l-5 4 Z" fill="#a5d8ff"></path>
<text x="80" y="600" class="t fs12" fill="#a5d8ff" id="log-2">C:\work and everything inside it.</text>
<text x="32" y="578" class="m fs10" fill="#7f9bb8" id="log-3-time">14:06</text><path d="M66 570 l5 4 l-5 4" stroke="#5eead4" fill="none" class="w15"></path>
<text x="80" y="578" class="t fs12" fill="#5eead4" id="log-3">Which folder exactly?</text>
<text x="32" y="556" class="m fs10" fill="#7f9bb8" id="log-4-time">14:05</text><path d="M66 548 l5 4 l-5 4 Z" fill="#a5d8ff"></path>
<text x="80" y="556" class="t fs12" fill="#a5d8ff" id="log-4">That deletes a folder recursively. Holding it.</text>
<text x="32" y="534" class="m fs10" fill="#7f9bb8" id="log-5-time">14:04</text><path d="M66 526 l5 4 l-5 4" stroke="#5eead4" fill="none" class="w15"></path>
<text x="80" y="534" class="t fs12" fill="#5eead4" id="log-5">Clear out the old work folder.</text>
<g id="log-older" display="inline">
<text x="32" y="512" class="m fs10" fill="#7f9bb8" id="log-6-time">14:04</text><path d="M66 504 l5 4 l-5 4 Z" fill="#a5d8ff"></path>
<text x="80" y="512" class="t fs12" fill="#a5d8ff" id="log-6">All green. 214 passed in 1m 42s.</text>
<text x="32" y="490" class="m fs10" fill="#7f9bb8" id="log-7-time">14:03</text><path d="M66 482 l5 4 l-5 4 Z" fill="#a5d8ff"></path>
<text x="80" y="490" class="t fs12" fill="#a5d8ff" id="log-7">Two failures in auth/session.ts. Patching.</text>
<text x="32" y="468" class="m fs10" fill="#7f9bb8" id="log-8-time">14:02</text><path d="M66 460 l5 4 l-5 4 Z" fill="#a5d8ff"></path>
<text x="80" y="468" class="t fs12" fill="#a5d8ff" id="log-8">Running 214 tests now.</text></g></g>
<g id="log-latest" display="none" transform="translate(0 -66)"><rect x="20" y="516" width="400" height="32" fill="currentColor" class="o04"></rect><rect x="20.5" y="516.5" width="399" height="31" stroke="currentColor" fill="none" class="w1 o25"></rect><path d="M20 524 V516 H28 M412 516 H420 V524 M420 540 V548 H412 M28 548 H20 V540" class="w15 o9" stroke="currentColor" fill="none"></path>
<text x="32" y="536" class="m fs10" fill="#7f9bb8" id="latest-1-time">14:06</text><path d="M66 528 l5 4 l-5 4" stroke="#5eead4" fill="none" class="w15"></path>
<text x="80" y="536" class="t fs12" fill="#5eead4" id="latest-1">Leave it for now.</text>
<g id="log-toggle-expand" display="inline"><circle cx="404" cy="532" r="11" fill="currentColor" stroke="currentColor" class="w1 chipbox"></circle><path d="M399 529.5 L404 534.5 L409 529.5" stroke="currentColor" fill="none" class="w2"></path></g></g>
<rect width="440" height="640" fill="url(#jh-scan)" pointer-events="none"></rect><path d="M2 16 V2 H16 M424 2 H438 V16" stroke="currentColor" fill="none" class="w1 o4"></path>
</svg>`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** The text of the element with this id. */
function setText(svg: string, id: string, text: string): string {
  return svg.replace(new RegExp(`(<text[^>]*\\bid="${id}"[^>]*>)[^<]*(</text>)`), (_, a: string, b: string) => `${a}${esc(text)}${b}`)
}

/** A gauge arc on the circle (220, 212) r 186, from a0 to a1 degrees clockwise from 3 o'clock. */
function arcPath(a0: number, a1: number): string {
  const pt = (a: number) => {
    const r = (a * Math.PI) / 180
    return `${(220 + 186 * Math.cos(r)).toFixed(1)} ${(212 + 186 * Math.sin(r)).toFixed(1)}`
  }
  if (Math.abs(a1 - a0) < 0.5) return `M${pt(a0)}`
  return `M${pt(a0)} A186 186 0 0 ${a1 > a0 ? 1 : 0} ${pt(a1)}`
}

function setArc(svg: string, id: string, d: string): string {
  return svg.replace(new RegExp(`d="[^"]*"([^>]*\\bid="${id}")`), `d="${d}"$1`)
}

const JARVIS = '#a5d8ff'
const YOU = '#5eead4'

/** One log row: marker (filled for JARVIS, outline for you) and text, at baseline y. */
function logRow(n: number, y: number, line: PanelLine | undefined): string {
  if (!line) return `<text x="80" y="${y}" class="t fs12" fill="${JARVIS}" id="log-${n}"></text>`
  const marker =
    line.who === 'you'
      ? `<path d="M66 ${y - 8} l5 4 l-5 4" stroke="${YOU}" fill="none" class="w15"></path>`
      : `<path d="M66 ${y - 8} l5 4 l-5 4 Z" fill="${JARVIS}"></path>`
  return `${marker}\n<text x="80" y="${y}" class="t fs12" fill="${line.who === 'you' ? YOU : JARVIS}" id="log-${n}">${esc(cut(line.text, 50))}</text>`
}

export function panelSvg(v: PanelView): string {
  let s = TEMPLATE
  const cls = [`state-${v.state}`, v.voiceOn ? 'voice-on' : '', v.micLive ? 'mic-live' : '', v.safety ? 'has-safety' : '']
    .filter(Boolean)
    .join(' ')
  s = s.replace(/(<svg id="jarvis-panel" class=")[^"]*"/, `$1${cls}"`)
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  s = setText(s, 'state', v.label.toUpperCase())
  s = setText(s, 'last-task', v.lastTask)
  s = setText(s, 'git-branch', cut(v.branch, 14))
  s = setText(s, 'git-status', v.gitStatus)
  s = s.replace(/(<text[^>]*\bid="git-status")[^>]*>/, m => (v.gitStatus === 'clean' ? m.replace('fill="#f5b544"', 'fill="#7f9bb8"') : m))

  // Hotkey chip
  s = setText(s, 'lbl-hotkey', v.hotkey ? v.hotkey.label.toUpperCase() : 'NO HOTKEY')
  if (!v.hotkey?.ready) s = s.replace(/(<circle id="dot-hotkey"[^>]*?) fill="currentColor"/, '$1 fill="none"')

  // Gauges
  const ctx = Math.max(0, Math.min(1, (v.ctxPct ?? 0) / 100))
  const lim = Math.max(0, Math.min(1, (v.limitPct ?? 0) / 100))
  s = setArc(s, 'ctx-arc', arcPath(140, 140 + 80 * ctx))
  s = setArc(s, 'limit-arc', arcPath(40, 40 - 80 * lim))

  // Safety
  if (v.safety) {
    s = setText(s, 'safety-reason', cut(v.safety.reason, 48))
    s = setText(s, 'safety-cmd', cut(v.safety.cmd, 52))
  }

  // Log: log-1 is the newest (bottom), log-8 the oldest; rows 22 px apart from y 622 upward.
  const recent = v.log.slice(-8).reverse()
  for (let n = 1; n <= 8; n++) {
    const y = 622 - (n - 1) * 22
    const row = new RegExp(`(?:<path d="M66 \\d+[^"]*"[^>]*></path>\\s*)?<text x="80" y="${y}"[^>]*\\bid="log-${n}"[^>]*>[^<]*</text>`)
    s = s.replace(row, logRow(n, y, recent[n - 1]))
    s = setText(s, `log-${n}-time`, recent[n - 1]?.time ?? '')
  }
  const latest = recent[0]
  s = setText(s, 'latest-1-time', latest?.time ?? '')
  s = setText(s, 'latest-1', latest ? cut(latest.text, 44) : '')
  return s
}
