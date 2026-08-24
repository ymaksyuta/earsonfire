import { keyLabel } from './fingeringData'

// Approximate layout of a Boehm clarinet, viewed from the front, loosely
// matching the shape of ref/clarinet_fingering.pdf: barrel at top, upper
// joint with the left-hand rings + register vent + side key, a joint
// band, then the lower joint with the right-hand rings + the stacked
// Ab/Eb, E/B, F/C, F#/C# pinky keys, and a flared bell at the bottom.
const RING_CX = 50
const RING_R = 7
const RING_HOLE_R = 4.6

function holeClass(active) {
  return active ? 'fd-hole fd-filled' : 'fd-hole'
}

function keyClass(active) {
  return active ? 'fd-key fd-filled' : 'fd-key'
}

// Renders one clarinet body illustration with rings, the register vent,
// the thumb hole, and the pinky/side keys shaded in for the given
// fingering. `fingering` is the object returned by getClarinetFingering(),
// or null/undefined if there's nothing to show for this slot.
export default function FingeringDiagram({ label, fingering }) {
  return (
    <div className="fingering-card">
      <div className="fingering-label">{label}</div>
      {!fingering ? (
        <div className="fingering-empty">—</div>
      ) : (
        <>
          <div className="fingering-note">
            {fingering.note}
            {fingering.confidence === 'approximate' && (
              <span
                className="approx-mark"
                title="Approximate fingering — verify against the reference chart"
              >
                *
              </span>
            )}
          </div>
          <svg
            viewBox="0 0 100 300"
            className="fingering-svg"
            role="img"
            aria-label={`Clarinet fingering for ${fingering.note}`}
          >
            {/* bell */}
            <path className="fd-body" d="M36,250 L64,250 L72,278 Q72,292 50,292 Q28,292 28,278 Z" />
            {/* lower joint */}
            <rect className="fd-body" x="35" y="150" width="30" height="102" rx="3" />
            {/* joint band */}
            <rect className="fd-band" x="33" y="146" width="34" height="6" rx="2" />
            {/* upper joint */}
            <rect className="fd-body" x="35" y="40" width="30" height="108" rx="3" />
            {/* barrel band + barrel */}
            <rect className="fd-band" x="34" y="14" width="32" height="6" rx="2" />
            <rect className="fd-body" x="36" y="4" width="28" height="14" rx="3" />

            {/* register vent (data-driven) + fixed speaker hole (decorative) */}
            <circle cx="42" cy="48" r="3.4" className={holeClass(fingering.register)}>
              <title>{keyLabel('register')}</title>
            </circle>
            <circle cx="52" cy="46" r="3" className="fd-hole" />

            {/* left-hand rings */}
            {['L1', 'L2', 'L3'].map((h, i) => (
              <g key={h}>
                <circle className="fd-ring" cx={RING_CX} cy={52 + i * 22} r={RING_R} />
                <circle
                  className={holeClass(fingering.holes[h])}
                  cx={RING_CX} cy={52 + i * 22} r={RING_HOLE_R}
                >
                  <title>{h}</title>
                </circle>
              </g>
            ))}

            {/* side key, upper joint right side */}
            <path className="fd-linkage" d="M65,86 Q76,88 75,98" />
            <ellipse cx="75" cy="100" rx="5" ry="6" className={keyClass(fingering.keys.includes('sideKey'))}>
              <title>{keyLabel('sideKey')}</title>
            </ellipse>

            {/* left pinky key: Ab/Eb */}
            <path className="fd-linkage" d="M35,100 Q20,105 22,118 Q23,128 35,126" />
            <ellipse cx="22" cy="120" rx="6" ry="8" className={keyClass(fingering.keys.includes('lowEb'))}>
              <title>{keyLabel('lowEb')}</title>
            </ellipse>

            {/* right-hand rings */}
            {['R1', 'R2', 'R3'].map((h, i) => (
              <g key={h}>
                <circle className="fd-ring" cx={RING_CX} cy={172 + i * 22} r={RING_R} />
                <circle
                  className={holeClass(fingering.holes[h])}
                  cx={RING_CX} cy={172 + i * 22} r={RING_HOLE_R}
                >
                  <title>{h}</title>
                </circle>
              </g>
            ))}

            {/* right pinky cluster: E/B, F/C, F#/C# */}
            <path className="fd-linkage" d="M65,214 Q80,220 78,233" />
            <ellipse cx="78" cy="235" rx="5.5" ry="6.5" className={keyClass(fingering.keys.includes('lowE'))}>
              <title>{keyLabel('lowE')}</title>
            </ellipse>
            <ellipse cx="75" cy="247" rx="5.5" ry="6.5" className={keyClass(fingering.keys.includes('lowF'))}>
              <title>{keyLabel('lowF')}</title>
            </ellipse>
            <ellipse cx="70" cy="258" rx="5.5" ry="6.5" className={keyClass(fingering.keys.includes('lowFsharp'))}>
              <title>{keyLabel('lowFsharp')}</title>
            </ellipse>

            {/* thumb hole, back of the instrument */}
            <circle cx="20" cy="56" r="5" className={holeClass(fingering.thumb)}>
              <title>Left thumb hole</title>
            </circle>
          </svg>
        </>
      )}
    </div>
  )
}
