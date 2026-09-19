import { useCallback, useRef, useState } from 'react';
import { animate as motionAnimate, useMotionValue, type PanInfo } from 'motion/react';

/** Horizontal clamp for Framer `dragConstraints`. */
export const SWIPE_MAX_PX = 100;
/** Commit threshold for complete / secondary swipe actions. */
export const SWIPE_COMMIT_PX = 80;

const SPRING_TRANSITION = { type: 'spring' as const, stiffness: 420, damping: 26, mass: 0.7 };

type SwipeCommitHandler = (offsetX: number) => void;

/**
 * Isolates horizontal card swipes from vertical list scrolling via Motion
 * `drag="x"` + `touch-action: pan-y` (parent lists keep pan-y).
 */
export function useHorizontalSwipeDrag(options: {
  enabled: boolean;
  onCommit: SwipeCommitHandler;
  onDragBegan?: () => void;
}) {
  const { enabled, onCommit, onDragBegan } = options;
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onDragBeganRef = useRef(onDragBegan);
  onDragBeganRef.current = onDragBegan;

  const resetToOrigin = useCallback(() => {
    void motionAnimate(x, 0, SPRING_TRANSITION);
    isDraggingRef.current = false;
    setIsDragging(false);
  }, [x]);

  const handleDragStart = useCallback(() => {
    hasMovedRef.current = true;
    isDraggingRef.current = true;
    setIsDragging(true);
    onDragBeganRef.current?.();
  }, []);

  const handleDrag = useCallback((_: unknown, info: PanInfo) => {
    if (Math.hypot(info.offset.x, info.offset.y) > 8) {
      hasMovedRef.current = true;
      onDragBeganRef.current?.();
    }
  }, []);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      const offsetX = info.offset.x;
      onCommitRef.current(offsetX);
      void motionAnimate(x, 0, SPRING_TRANSITION);
    },
    [x]
  );

  const markTapCandidate = useCallback(() => {
    hasMovedRef.current = false;
  }, []);

  const didMove = useCallback(() => hasMovedRef.current || isDraggingRef.current, []);

  return {
    x,
    isDragging,
    isDraggingRef,
    hasMovedRef,
    didMove,
    markTapCandidate,
    resetToOrigin,
    dragProps: {
      drag: enabled ? ('x' as const) : false,
      dragConstraints: { left: -SWIPE_MAX_PX, right: SWIPE_MAX_PX },
      dragElastic: 0.2,
      dragMomentum: false,
      dragPropagation: false,
      onDragStart: handleDragStart,
      onDrag: handleDrag,
      onDragEnd: handleDragEnd,
      style: { x, touchAction: 'pan-y' as const },
    },
  };
}
