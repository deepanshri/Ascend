import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { Mascot, randomWalkDuration, randomWalkTarget, type MascotAngle } from './Mascot';

const CANVAS_W = 360;
const CANVAS_H = 200;
const TRACK_CX = 180;
const TRACK_CY = 154;
const WALK_PAD = 8;
const PROXIMITY = 18;

type GridLayer = {
  r: number;
  count: number;
  highlighted: (i: number) => boolean;
  rOn: number;
  rOff: number;
  opacityOn: number;
  opacityOff: number;
};

const GRID_LAYERS: GridLayer[] = [
  { r: 62, count: 11, highlighted: (i) => i % 3 !== 1, rOn: 4.2, rOff: 3.4, opacityOn: 0.9, opacityOff: 0.65 },
  { r: 78, count: 13, highlighted: (i) => i % 2 === 0, rOn: 4.0, rOff: 3.2, opacityOn: 0.85, opacityOff: 0.58 },
  { r: 94, count: 15, highlighted: (i) => (i + 2) % 3 === 0, rOn: 3.8, rOff: 3.0, opacityOn: 0.8, opacityOff: 0.48 },
  { r: 110, count: 17, highlighted: (i) => (i + 1) % 3 === 0, rOn: 3.6, rOff: 2.8, opacityOn: 0.75, opacityOff: 0.4 },
];

export interface TrackDot {
  key: string;
  x: number;
  y: number;
  highlighted: boolean;
  radius: number;
  restOpacity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildMascotGridDots(): TrackDot[] {
  const dots: TrackDot[] = [];
  GRID_LAYERS.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.count; i += 1) {
      const frac = layer.count > 1 ? i / (layer.count - 1) : 0.5;
      const angleDeg = 172 - frac * (172 - 8);
      const rad = (angleDeg * Math.PI) / 180;
      const highlighted = layer.highlighted(i);
      dots.push({
        key: `l${layerIndex}-${i}`,
        x: TRACK_CX + layer.r * Math.cos(rad),
        y: TRACK_CY - layer.r * Math.sin(rad),
        highlighted,
        radius: highlighted ? layer.rOn : layer.rOff,
        restOpacity: highlighted ? layer.opacityOn : layer.opacityOff,
      });
    }
  });
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
  const dots = useMemo(() => buildMascotGridDots(), []);
  const bounds = useMemo(() => {
    const xs = dots.map((dot) => dot.x);
    const ys = dots.map((dot) => dot.y);
    return {
      minX: Math.min(...xs) + WALK_PAD,
      maxX: Math.max(...xs) - WALK_PAD,
      minY: Math.min(...ys) + WALK_PAD,
      maxY: Math.max(...ys) - WALK_PAD,
    };
  }, [dots]);

  const start = useMemo(
    () => ({ x: TRACK_CX, y: clamp(TRACK_CY - 72, bounds.minY, bounds.maxY) }),
    [bounds.maxY, bounds.minY]
  );

  const posX = useMotionValue(start.x);
  const posY = useMotionValue(start.y);
  const leftPct = useTransform(posX, (x) => `${(x / CANVAS_W) * 100}%`);
  const topPct = useTransform(posY, (y) => `${(y / CANVAS_H) * 100}%`);

  const prevXRef = useRef(start.x);
  const [mascotPos, setMascotPos] = useState(start);
  const [angle, setAngle] = useState<MascotAngle>('front');

  useEffect(() => {
    posX.set(start.x);
    posY.set(start.y);
    prevXRef.current = start.x;
    setMascotPos(start);

    let cancelled = false;
    let timer: number | null = null;
    let controls: Array<{ stop: () => void }> = [];

    const roam = () => {
      if (cancelled) return;
      const target = randomWalkTarget(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
      const duration = randomWalkDuration(3, 6);
      const ax = animate(posX, target.x, { duration, ease: 'easeInOut' });
      const ay = animate(posY, target.y, { duration, ease: 'easeInOut' });
      controls = [ax, ay];
      timer = window.setTimeout(roam, duration * 1000);
    };

    roam();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      controls.forEach((item) => item.stop());
    };
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, posX, posY, start]);

  useMotionValueEvent(posX, 'change', (x) => {
    const roundedX = Math.round(x * 2) / 2;
    const roundedY = Math.round(posY.get() * 2) / 2;
    setMascotPos((prev) => (prev.x === roundedX && prev.y === roundedY ? prev : { x: roundedX, y: roundedY }));
    if (x > prevXRef.current + 0.35) setAngle('frontRight');
    else if (x < prevXRef.current - 0.35) setAngle('frontLeft');
    prevXRef.current = x;
  });

  useMotionValueEvent(posY, 'change', (y) => {
    const roundedX = Math.round(posX.get() * 2) / 2;
    const roundedY = Math.round(y * 2) / 2;
    setMascotPos((prev) => (prev.x === roundedX && prev.y === roundedY ? prev : { x: roundedX, y: roundedY }));
  });

  return (
    <div
      id="mascot-dot-track"
      className="absolute inset-0 z-[1] isolate pointer-events-none overflow-visible"
      aria-hidden="true"
    >
      {dots.map((dot) => {
        const pressed = Math.hypot(dot.x - mascotPos.x, dot.y - mascotPos.y) <= PROXIMITY;
        return (
          <motion.span
            key={dot.key}
            className="absolute rounded-full"
            style={{
              left: `${(dot.x / CANVAS_W) * 100}%`,
              top: `${(dot.y / CANVAS_H) * 100}%`,
              width: `${((dot.radius * 2) / CANVAS_W) * 100}%`,
              aspectRatio: '1 / 1',
              backgroundColor: dot.highlighted ? dotColor : emptyDotStroke,
              x: '-50%',
              y: '-50%',
              zIndex: pressed ? -1 : 0,
            }}
            animate={{
              scale: pressed ? 0.65 : 1,
              opacity: pressed ? 0.4 : dot.restOpacity,
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 24, mass: 0.6 }}
          />
        );
      })}

      <motion.div
        id="mascot-companion"
        className="absolute z-[1] pointer-events-none"
        style={{
          left: leftPct,
          top: topPct,
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
