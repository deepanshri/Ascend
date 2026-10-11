/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ascend Motion Design System  ·  Spring Physics Token Library
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  All transitions, gestures, and layout changes use one shared spring grammar.
 *  Never add a raw `duration` + `ease` pair to a component — import a token.
 *
 *  Spring tuning philosophy:
 *    • "Snappy" springs  → high stiffness, moderate damping  (feels responsive)
 *    • "Gentle" springs  → lower stiffness, higher damping   (feels soft/floaty)
 *    • "Critical" damp   → damping² ≥ 4 × mass × stiffness  (zero oscillation)
 *
 *  We use three critically-damped tiers:
 *    SNAPPY  : stiffness 480, damping 38, mass 1   → instant, zero bounce
 *    FLUID   : stiffness 320, damping 30, mass 1   → smooth, one gentle settle
 *    GENTLE  : stiffness 180, damping 24, mass 1   → soft, floaty, organic
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Transition } from 'motion/react';

// ─── Spring Transition Tokens ─────────────────────────────────────────────────

/** Instant, critically-damped — for nav pills, active indicators, focus rings. */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 480,
  damping: 38,
  mass: 1,
};

/** Smooth, slightly cushioned — the default for card reveals and layout shifts. */
export const springFluid: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 1,
};

/** Soft, organic — for modals, overlays, and large layout changes. */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 180,
  damping: 24,
  mass: 1,
};

// ─── Micro-Interaction Tokens ─────────────────────────────────────────────────

/**
 * Default tap press for all interactive elements.
 * Pair with springSnappy on the parent's `transition` prop.
 *
 * @example
 * <motion.button whileTap={tapPress} transition={springSnappy} />
 */
export const tapPress = { scale: 0.94 };

/**
 * Active/pressed state for nav tabs — scale + slight brightness.
 */
export const navTabPress = { scale: 0.90, opacity: 0.75 };

// ─── Overlay & Modal Presets ──────────────────────────────────────────────────

/**
 * Full-screen backdrop fade.
 * Uses a fast spring so the backdrop appears nearly instantly.
 */
export const overlayFade = {
  initial:    { opacity: 0 },
  animate:    { opacity: 1 },
  exit:       { opacity: 0 },
  transition: { ...springFluid, duration: undefined } as Transition,
};

/**
 * Sheet/card entrance — slides up from 16 px below, scales in from 96 %.
 * Critically damped so there's no jelly bounce on open.
 */
export const sheetMotion = {
  initial:    { opacity: 0, scale: 0.96, y: 16 },
  animate:    { opacity: 1, scale: 1,    y: 0  },
  exit:       { opacity: 0, scale: 0.96, y: 10 },
  transition: springGentle,
};

/**
 * Bottom-sheet style — slides up from below the viewport edge.
 */
export const bottomSheetMotion = {
  initial:    { opacity: 0, y: 40 },
  animate:    { opacity: 1, y: 0  },
  exit:       { opacity: 0, y: 32 },
  transition: springFluid,
};

// ─── List & Stagger Tokens ────────────────────────────────────────────────────

/**
 * Container that drives staggered children.
 * Wrap a list with this so items flow in sequentially.
 *
 * @example
 * <motion.ul variants={staggerContainer} initial="hidden" animate="show">
 *   {items.map(i => <motion.li key={i.id} variants={staggerItem} />)}
 * </motion.ul>
 */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren:  0.055,
      delayChildren:    0.04,
      ...springFluid,
    },
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.025, staggerDirection: -1 },
  },
};

/**
 * Single stagger item — slides up 12 px and fades in.
 */
export const staggerItem = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,   transition: springFluid },
  exit:   { opacity: 0, y: 6,  scale: 0.97 },
};

// ─── Page / Tab Transition Tokens ─────────────────────────────────────────────

// ─── Navigation Active-Indicator Token ────────────────────────────────────────

// ─── Utility: build a stagger delay for index n ───────────────────────────────

/**
 * Returns a transition with a staggered delay based on item index.
 * Used when you can't use variant stagger (e.g., mixed lists).
 *
 * @example
 * <motion.div
 *   initial={{ opacity: 0, y: 10 }}
 *   animate={{ opacity: 1, y: 0 }}
 *   transition={staggerDelay(index)}
 * />
 */
export const staggerDelay = (index: number, base = springFluid): Transition => ({
  ...base,
  delay: Math.min(index * 0.048, 0.32),
});
