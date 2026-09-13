import { useId } from 'react';

export type MascotAngle =
  | 'front'
  | 'frontLeft'
  | 'left'
  | 'back'
  | 'right'
  | 'frontRight';

export type MascotMood = 'excited' | 'focused' | 'tired';

interface MascotProps {
  size?: number;
  angle?: MascotAngle;
  animate?: boolean;
  momentumScore?: number;
  celebrate?: boolean;
}

/** Map a 0–100 momentum score to the mascot's facing angle. */
export function mascotAngleFromMomentum(score: number): MascotAngle {
  if (score <= 20) return 'back';
  if (score <= 40) return 'left';
  if (score <= 60) return 'frontLeft';
  if (score <= 80) return 'front';
  return 'frontRight';
}

export function mascotMoodFromMomentum(score: number): MascotMood {
  if (score >= 75) return 'excited';
  if (score >= 40) return 'focused';
  return 'tired';
}

export function Mascot({
  size = 88,
  angle = 'front',
  animate = true,
  momentumScore,
  celebrate = false,
}: MascotProps) {
  const uid = useId().replace(/:/g, '');
  const capeGrad = `mascot-cape-${uid}`;
  const backCapeGrad = `mascot-back-cape-${uid}`;
  const bodyGrad = `mascot-body-${uid}`;
  const cheekGrad = `mascot-cheek-${uid}`;
  const shadowBlur = `mascot-shadow-${uid}`;

  const mood = mascotMoodFromMomentum(Number.isFinite(momentumScore) ? Number(momentumScore) : 50);
  const isBack = angle === 'back';
  const facingLeft = angle === 'left' || angle === 'frontLeft';
  const facingRight = angle === 'right' || angle === 'frontRight';
  const sideView = angle === 'left' || angle === 'right';
  const bodyRx = sideView ? 27.5 : 33.5;

  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={capeGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6B82A8" />
          <stop offset="100%" stopColor="#263E68" />
        </linearGradient>

        <linearGradient id={backCapeGrad} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#536B91" />
          <stop offset="100%" stopColor="#243A60" />
        </linearGradient>

        <radialGradient id={bodyGrad} cx="34%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#F4F6F7" />
          <stop offset="100%" stopColor="#E3E7EA" />
        </radialGradient>

        <radialGradient id={cheekGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFAAA9" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#FFC8C6" stopOpacity="0" />
        </radialGradient>

        <filter id={shadowBlur} x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <ellipse
        cx="50"
        cy="86"
        rx="24"
        ry="4.5"
        fill="#000000"
        opacity="0.09"
        filter={`url(#${shadowBlur})`}
      />

      {!facingLeft && (
        <path
          d="M 78 40 C 98 47, 106 57, 100 63 C 94 68, 85 67, 79 62 Z"
          fill={`url(#${capeGrad})`}
        />
      )}
      {!facingRight && (
        <path
          d="M 22 40 C 2 48, -6 57, 0 63 C 6 68, 15 67, 21 62 Z"
          fill={`url(#${capeGrad})`}
        />
      )}

      {isBack ? (
        <>
          <path
            d="M 20 37 C 28 52, 31 75, 50 83 C 69 75, 72 52, 80 37 Z"
            fill={`url(#${backCapeGrad})`}
          />
          <ellipse cx="50" cy="50" rx="33.5" ry="33.5" fill="#F3F5F6" />
        </>
      ) : (
        <>
          <ellipse
            cx="50"
            cy="47"
            rx={bodyRx}
            ry="33.5"
            fill={`url(#${bodyGrad})`}
            stroke="#D8DDE1"
            strokeWidth="0.8"
          />

          {!sideView && (
            <>
              <ellipse cx="17" cy="65" rx="8" ry="6" fill="#F4F5F6" />
              <ellipse cx="83" cy="65" rx="8" ry="6" fill="#F4F5F6" />
            </>
          )}

          <ellipse cx="38" cy="84" rx="6.5" ry="4" fill="#334B74" />
          <ellipse cx="62" cy="84" rx="6.5" ry="4" fill="#334B74" />

          {sideView ? (
            <>
              <ellipse
                cx={facingLeft ? 40 : 60}
                cy="42"
                rx="3.25"
                ry="6.5"
                fill="#151B28"
              />
              <path
                d={
                  facingLeft
                    ? 'M 37 57 Q 46 65 52 58'
                    : 'M 63 57 Q 54 65 48 58'
                }
                fill="none"
                stroke="#151B28"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <ellipse cx="38.5" cy="42" rx="3.5" ry="7" fill="#151B28" />
              <ellipse cx="61.5" cy="42" rx="3.5" ry="7" fill="#151B28" />
              <circle cx="29" cy="54" r="7.5" fill={`url(#${cheekGrad})`} />
              <circle cx="71" cy="54" r="7.5" fill={`url(#${cheekGrad})`} />
              <path
                d={mood === 'tired' ? 'M 41 62 Q 50 58 59 62' : 'M 41 58 Q 50 67 59 58'}
                fill="none"
                stroke="#151B28"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </>
          )}
        </>
      )}
    </svg>
  );

  if (!animate) {
    return svg;
  }

  return (
    <div
      className={`relative z-10 mascot-shell mascot-mood-${mood}${celebrate ? ' is-celebrating' : ''}`}
      aria-hidden="true"
    >
      {mood === 'excited' && <span className="mascot-aura" />}
      <div className="mascot-drift-x">
        <div className="mascot-float-y">
          <div className="mascot-tilt">
            <div className="mascot-celebrate-layer">
              <div className="mascot-breathe">
                <div className="mascot-posture">{svg}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
