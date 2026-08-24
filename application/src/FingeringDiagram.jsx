import { HOLE_ORDER, PINKY_KEYS, keyLabel } from './fingeringData'

const RING_Y = { L1: 52, L2: 70, L3: 88, R1: 112, R2: 130, R3: 148 }

// Renders one small clarinet body with the thumb hole, register key,
// six ring holes, and pinky keys shaded in for the given fingering.
// `fingering` is the object returned by getClarinetFingering(), or null
// if there's nothing to show for this slot yet.
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
          <svg viewBox="0 0 80 200" className="fingering-svg" role="img" aria-label={`Clarinet fingering for ${fingering.note}`}>
            <rect x="20" y="8" width="40" height="168" rx="18" className="fd-body" />
            <circle
              cx="14" cy="24" r="6"
              className={fingering.thumb ? 'fd-hole fd-filled' : 'fd-hole'}
            >
              <title>Left thumb hole</title>
            </circle>
            <rect
              x="4" y="34" width="9" height="9"
              className={fingering.register ? 'fd-key fd-filled' : 'fd-key'}
            >
              <title>{keyLabel('register')}</title>
            </rect>
            {HOLE_ORDER.map((h) => (
              <circle
                key={h} cx="40" cy={RING_Y[h]} r="6"
                className={fingering.holes[h] ? 'fd-hole fd-filled' : 'fd-hole'}
              >
                <title>{h}</title>
              </circle>
            ))}
            {PINKY_KEYS.map((k, i) => (
              <rect
                key={k}
                x={24 + i * 8} y="180" width="6" height="6"
                className={fingering.keys.includes(k) ? 'fd-key fd-filled' : 'fd-key'}
              >
                <title>{keyLabel(k)}</title>
              </rect>
            ))}
          </svg>
        </>
      )}
    </div>
  )
}
