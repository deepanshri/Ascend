import { useCallback, useRef } from 'react';
import { animate as motionAnimate, useMotionValue, type PanInfo } from 'motion/react';

/** Horizontal clamp for Framer `dragConstraints`. */
export const SWIPE_MAX_PX = 100;
/** Commit threshold for complete / secondary swipe actions. */
export const SWIPE_COMMIT_PX = 80;
/** Shared drag constraints — hoist so cards don't allocate a new object per render. */
export const SWIPE_DRAG_CONSTRAINTS = { left: -SWIPE_MAX_PX, right: SWIPE_MAX_PX } as const;

const SPRING_TRANSITION = { type: 'spring' as const, stiffness: 420, damping: 26, mass: 0.7 };

type SwipeCommitHandler = (offsetX: number) => void;

/**
 * Isolates horizontal card swipes from vertical list scrolling via Motion
 * `drag="x"`. Touch-action is CSS `pan-y` by default; callers must set
 * `el.style.touchAction = 'none'` on drag start via DOM (never React style /
 * setState mid-gesture — that freezes Capacitor WebViews).
 */
export function useHorizontalSwipeDrag(options: {
  enabled: boolean;
  onCommit: SwipeCommitHandler;
  onDragBegan?: () => void;
}) {
  const { enabled, onCommit, onDragBegan } = options;
  const x = useMotionValue(0);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onDragBeganRef = useRef(onDragBegan);
  onDragBeganRef.current = onDragBegan;

  const resetToOrigin = useCallback(() => {
    void motionAnimate(x, 0, SPRING_TRANSITION);
    isDraggingRef.current = false;
  }, [x]);

  const handleDragStart = useCallback(() => {
    hasMovedRef.current = true;
    isDraggingRef.current = true;
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
      const offsetX = info.offset.x;
      // Defer commit so Motion can finish pointer teardown before App setState.
      requestAnimationFrame(() => {
        onCommitRef.current(offsetX);
      });
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
    isDragging: false,
    isDraggingRef,
    hasMovedRef,
    didMove,
    markTapCandidate,
    resetToOrigin,
    dragProps: {
      drag: enabled ? ('x' as const) : false,
      dragConstraints: SWIPE_DRAG_CONSTRAINTS,
      dragElastic: 0.2,
      dragMomentum: false,
      dragPropagation: false,
      onDragStart: handleDragStart,
      onDrag: handleDrag,
      onDragEnd: handleDragEnd,
      // Do not put touchAction here — React would overwrite DOM locks on re-render.
      style: { x },
    },
  };
}
