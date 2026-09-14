import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { Mascot, type MascotAngle } from './Mascot';

const CANVAS_W = 360;
const CANVAS_H = 215;
const TRACK_CX = 180;
const TRACK_CY = 160;
const TRACK_R = 110;
const TRACK_START_DEG = 172;
const TRACK_END_DEG = 8;
const TRACK_DOT_COUNT = 17;
const ROAM_DURATION_S = 14;

export interface TrackDot {
  i: number;
  x: number;
  y: number;
  highlighted: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function yOnTrack(viewX: number): number {
  const dx = clamp((viewX - TRACK_CX) / TRACK_R, -1, 1);
  return TRACK_CY - TRACK_R * Math.sin(Math.acos(dx));
}

export function buildMascotTrackDots(): TrackDot[] {
  const dots: TrackDot[] = [];
  for (let i = 0; i < TRACK_DOT_COUNT; i += 1) {
    const frac = TRACK_DOT_COUNT > 1 ? i / (TRACK_DOT_COUNT - 1) : 0.5;
    const angleDeg = TRACK_START_DEG - frac * (TRACK_START_DEG - TRACK_END_DEG);
    const rad = (angleDeg * Math.PI) / 180;
    dots.push({
      i,
      x: TRACK_CX + TRACK_R * Math.cos(rad),
      y: TRACK_CY - TRACK_R * Math.sin(rad),
      highlighted: (i + 1) % 3 === 0,
    });
  }
  return dots;
}

interface MascotDotTrackProps {
  celebrate?: boolean;
  momentumScore?: number;
  dotColor: string;
  emptyDotStroke: string;
}

export const MascotDotTrack: React.FC<MascotDotTrackProps> = ({
  celebrate = false,
  momentumScore,
  dotColor,
  emptyDotStroke,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const prevXRef = useRef(0);
  const dots = useMemo(() => buildMascotTrackDots(), []);
  const firstX = dots[0]?.x ?? TRACK_CX;
  const lastX = dots[dots.length - 1]?.x ?? TRACK_CX;
  const fullTrackWidth = lastX - firstX;
  const influence = fullTrackWidth / Math.max(dots.length - 1, 1);

  const [spanPx, setSpanPx] = useState(fullTrackWidth);
  const [mascotViewX, setMascotViewX] = useState(TRACK_CX);
  const [angle, setAngle] = useState<MascotAngle>('front');

  const halfSpan = spanPx / 2;
  const roamX = useMotionValue(-halfSpan);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => {
      setSpanPx(el.clientWidth * (fullTrackWidth / CANVAS_W));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fullTrackWidth]);

  useEffect(() => {
    roamX.set(-halfSpan);
    prevXRef.current = -halfSpan;
    const controls = animate(roamX, [-halfSpan, halfSpan], {
      duration: ROAM_DURATION_S,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: 'easeInOut',
    });
    return () => controls.stop();
  }, [halfSpan, roamX]);

  const mascotTop = useTransform(roamX, (xPx) => {
    const viewX = TRACK_CX + (halfSpan > 0 ? xPx / halfSpan : 0) * (fullTrackWidth / 2);
    return `${(yOnTrack(clamp(viewX, firstX, lastX)) / CANVAS_H) * 100}%`;
  });

  useMotionValueEvent(roamX, 'change', (xPx) => {
    const viewX = TRACK_CX + (halfSpan > 0 ? xPx / halfSpan : 0) * (fullTrackWidth / 2);
    const boundedX = clamp(viewX, firstX, lastX);
    const rounded = Math.round(boundedX * 2) / 2;
    setMascotViewX((prev) => (prev === rounded ? prev : rounded));
    if (xPx > prevXRef.current + 0.35) setAngle('frontRight');
    else if (xPx < prevXRef.current - 0.35) setAngle('frontLeft');
    prevXRef.current = xPx;
  });

  return (
    <div
      ref={trackRef}
      id="mascot-dot-track"
      className="absolute inset-0 z-[1] isolate pointer-events-none overflow-visible"
      aria-hidden="true"
    >
      {dots.map((dot) => {
        const pressed = Math.abs(dot.x - mascotViewX) <= influence * 0.9;
        const radius = dot.highlighted ? 3.6 : 2.8;
        return (
          <motion.span
            key={`track-dot-${dot.i}`}
            className="absolute rounded-full"
            style={{
              left: `${(dot.x / CANVAS_W) * 100}%`,
              top: `${(dot.y / CANVAS_H) * 100}%`,
              width: `${((radius * 2) / CANVAS_W) * 100}%`,
              aspectRatio: '1 / 1',
              backgroundColor: dot.highlighted ? dotColor : emptyDotStroke,
              x: '-50%',
              y: '-50%',
              zIndex: pressed ? -1 : 0,
            }}
            animate={{
              scale: pressed ? 0.65 : 1,
              opacity: pressed ? 0.4 : dot.highlighted ? 0.75 : 0.4,
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 24, mass: 0.6 }}
          />
        );
      })}

      <motion.div
        id="mascot-companion"
        className="absolute z-[1] pointer-events-none"
        style={{
          x: roamX,
          left: `${(TRACK_CX / CANVAS_W) * 100}%`,
          top: mascotTop,
        }}
      >
        <div className="mascot-track-slot pointer-events-none">
          <Mascot
            size={56}
            angle={angle}
            momentumScore={momentumScore}
            celebrate={celebrate}
            animate
            roam
          />
        </div>
      </motion.div>
    </div>
  );
};
