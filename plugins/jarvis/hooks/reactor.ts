// The Hub's reactor: an animated holographic gyroscope, coloured and paced by JARVIS's state.

export type ReactorMood = 'idle' | 'speaking' | 'listening' | 'working' | 'error' | 'muted'

export const MOOD_COLOR: Record<ReactorMood, string> = {
  idle: '#38bdf8',
  speaking: '#7dd3fc',
  listening: '#5eead4',
  working: '#f5b544',
  error: '#f0524f',
  muted: '#64748b',
}

/**
 * The reactor, after the person's reference: a gyroscope hologram. A glowing sphere with a wireframe
 * sits over a projector pad and its light cone; two crossing tilted orbits and a dashed level orbit,
 * each with node dots, spin around it; a HUD frame (outer ring, tick ring, dashed perspective ring,
 * bracket arcs and bars) turns slowly around the lot. Calm when standing by; listening, thinking and
 * speaking it speeds up, brightens and throws sparks. Pure vector, so the desktop app animates it.
 */
export function reactor(mood: ReactorMood): string {
  const c = MOOD_COLOR[mood]
  const u = `jv-${mood}`
  const busy = mood === 'speaking' || mood === 'working' || mood === 'listening'
  const k = mood === 'working' ? 0.35 : busy ? 0.55 : 1 // time scale: smaller is faster
  const pulse = mood === 'speaking' ? 0.45 : mood === 'working' ? 0.9 : mood === 'listening' ? 1.4 : 3.2
  const sparkCount = mood === 'speaking' ? 16 : mood === 'working' ? 12 : mood === 'listening' ? 8 : mood === 'error' ? 4 : 0
  const cx = 100
  const cy = 88

  const spin = (secs: number, reverse = false) =>
    `transform-origin:${cx}px ${cy}px;animation:spin ${(secs * k).toFixed(2)}s linear infinite${reverse ? ' reverse' : ''}`

  // An orbit: an ellipse tilted by `tilt`, spinning in its own plane, with node dots at its ends.
  const orbit = (tilt: number, rx: number, ry: number, dash: string, secs: number, reverse: boolean, nodes: boolean, width: number) =>
    `<g transform="rotate(${tilt} ${cx} ${cy})"><g style="${spin(secs, reverse)}">` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} filter="url(#${u}-glow)"/>` +
    (nodes
      ? [0, Math.PI].map(a => `<circle cx="${(cx + Math.cos(a) * rx).toFixed(1)}" cy="${(cy + Math.sin(a) * ry).toFixed(1)}" r="2.3" fill="#ffffff" stroke="${c}" stroke-width="1"/>`).join('')
      : '') +
    `</g></g>`

  // An arc of the HUD frame from angle a0 to a1 (degrees, 0 = right, clockwise) at radius r.
  const arc = (r: number, a0: number, a1: number, width: number, opacity = 1) => {
    const p = (a: number) => [cx + Math.cos((a * Math.PI) / 180) * r, cy + Math.sin((a * Math.PI) / 180) * r].map(n => n.toFixed(1)).join(' ')
    return `<path d="M${p(a0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}" fill="none" stroke="${c}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="butt"/>`
  }

  const sparks = Array.from({ length: sparkCount }, (_, i) => {
    const a = (i / Math.max(1, sparkCount)) * Math.PI * 2 + i * 0.7
    const dist = 30 + ((i * 13) % 22)
    const dx = (Math.cos(a) * dist).toFixed(1)
    const dy = (Math.sin(a) * dist * 0.8).toFixed(1)
    const delay = (((i * 37) % 100) / 100) * 1.4
    return `<circle cx="${cx}" cy="${cy}" r="${i % 3 === 0 ? 1.3 : 0.8}" fill="#ffffff" style="--dx:${dx}px;--dy:${dy}px;animation:spark 1.4s ease-out infinite;animation-delay:-${delay.toFixed(2)}s"/>`
  }).join('')

  const scan = Array.from({ length: 50 }, (_, i) => `<rect x="0" y="${i * 4}" width="200" height="1.3" fill="${c}" fill-opacity=".05"/>`).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
<defs>
<radialGradient id="${u}-core" cx="44%" cy="40%" r="62%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2fdff"/><stop offset=".8" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity=".15"/></radialGradient>
<radialGradient id="${u}-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${c}" stop-opacity=".45"/><stop offset=".5" stop-color="${c}" stop-opacity=".1"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
<linearGradient id="${u}-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset=".6" stop-color="${c}" stop-opacity=".3"/><stop offset="1" stop-color="${c}" stop-opacity=".05"/></linearGradient>
<radialGradient id="${u}-pad" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".5" stop-color="${c}" stop-opacity=".6"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
<filter id="${u}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="${u}-soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
<clipPath id="${u}-sphere"><circle cx="${cx}" cy="${cy}" r="22"/></clipPath>
</defs>
<style>
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes throb{0%,100%{transform:scale(.95)}50%{transform:scale(1.05)}}
@keyframes flick{0%,100%{opacity:.95}6%{opacity:.8}7%{opacity:.97}52%{opacity:.88}53%{opacity:.98}}
@keyframes scan{to{transform:translateY(4px)}}
@keyframes beam{0%,100%{opacity:.8}50%{opacity:1}}
@keyframes spark{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
.holo{animation:flick 5s steps(1) infinite}
.core{transform-origin:${cx}px ${cy}px;animation:throb ${pulse}s ease-in-out infinite}
.beam{animation:beam ${pulse}s ease-in-out infinite}
.scan{animation:scan 1s linear infinite}
</style>
<circle cx="${cx}" cy="${cy + 8}" r="96" fill="url(#${u}-halo)"/>
<g class="holo">
<path class="beam" d="M88 172 L94 108 L106 108 L112 172 Z" fill="url(#${u}-beam)"/>
<ellipse cx="${cx}" cy="172" rx="34" ry="8" fill="none" stroke="${c}" stroke-width="1.6" filter="url(#${u}-glow)"/>
<ellipse cx="${cx}" cy="172" rx="28" ry="6.3" fill="none" stroke="${c}" stroke-opacity=".7" stroke-width="1"/>
<ellipse cx="${cx}" cy="172" rx="17" ry="4" fill="url(#${u}-pad)" stroke="${c}" stroke-width="2.4" filter="url(#${u}-glow)"/>
<g style="${spin(60)}">
<circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="${c}" stroke-width="1.6" filter="url(#${u}-glow)"/>
${arc(72, 200, 245, 2.2)}${arc(72, 290, 318, 4.5)}${arc(72, 10, 48, 1.6, 0.8)}${arc(72, 120, 140, 4)}
${arc(78, 168, 182, 4.5)}${arc(78, 352, 366, 4.5)}
</g>
<g style="${spin(90, true)}"><circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="${c}" stroke-width="2.6" stroke-dasharray="0.9 2.2" stroke-opacity=".85"/></g>
<circle cx="${cx}" cy="${cy}" r="53" fill="none" stroke="${c}" stroke-width=".9" stroke-opacity=".8"/>
<g transform="rotate(-6 ${cx} ${cy})"><g style="${spin(40)}"><ellipse cx="${cx}" cy="${cy}" rx="50" ry="34" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 3" stroke-opacity=".8"/></g></g>
${orbit(0, 44, 12, '4 3', 16, true, true, 1.4)}
<g class="core">
<circle cx="${cx}" cy="${cy}" r="30" fill="${c}" fill-opacity=".35" filter="url(#${u}-soft)"/>
<circle cx="${cx}" cy="${cy}" r="22" fill="url(#${u}-core)" filter="url(#${u}-glow)"/>
<g clip-path="url(#${u}-sphere)" fill="none" stroke="${c}" stroke-opacity=".45" stroke-width=".6">
<g style="${spin(24)}"><ellipse cx="${cx}" cy="${cy}" rx="22" ry="7"/><ellipse cx="${cx}" cy="${cy}" rx="22" ry="15"/><ellipse cx="${cx}" cy="${cy}" rx="8" ry="22"/><ellipse cx="${cx}" cy="${cy}" rx="16" ry="22"/></g>
</g>
<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width=".7"/>
</g>
${orbit(-34, 50, 15, '', 11, false, true, 2)}
${orbit(56, 50, 15, '', 14, true, true, 2)}
<g>${sparks}</g>
<g class="scan">${scan}</g>
</g>
</svg>`
}

