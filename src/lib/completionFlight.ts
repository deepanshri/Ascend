/**
 * Completion flight data and screen geometry: where a completed habit's
 * marble starts and where it lands. No three.js here, so the app shell can
 * plan a flight before the lazily loaded 3D overlay has arrived.
 */

export interface FlightHandoffVelocity {
  vx: number;
  vy: number;
  vz: number;
}

export interface PieceFlight {
  /** Unique flight instance id. */
  id: string;
  /** Matches AccumulationPiece.id (`habitId::isoDate`) — hidden in bowl until land. */
  pieceId: string;
  /** Explicit completion type — drives getMarbleColor light vs solid shade. */
  isFallback: boolean;
  /** @deprecated Prefer isFallback — kept for bowl pieceId kind parity. */
  kind: 'full' | 'fallback';
  from: { x: number; y: number };
  to: { x: number; y: number };
  isDark: boolean;
  direction?: 'left' | 'right';
  /** Hex from getMarbleColor(isDark, isFallback) at throw time. */
  color?: string;
  /** Relative horizontal touch point on card (0 = left, 1 = right). */
  touchRatio?: number;
}

/**
 * Resolve card swipe point → bowl rim opening (handoff).
 * Destination is the aperture at the top of the bowl — never mid-glass —
 * so the overlay can hover above then drop vertically into the opening.
 */
let cachedBowlRect: { rect: DOMRect; timestamp: number } | null = null;

function getCachedBowlRect(): DOMRect | null {
  const now = Date.now();
  if (cachedBowlRect && now - cachedBowlRect.timestamp < 100) {
    return cachedBowlRect.rect;
  }
  const bowlFrame = document.getElementById('accumulation-bowl-frame');
  const bowl = bowlFrame || document.getElementById('accumulation-bowl');
  if (bowl) {
    const r = bowl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      cachedBowlRect = { rect: r, timestamp: now };
      return r;
    }
  }
  return null;
}

export function isBowlElementOffscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const bowlFrame = document.getElementById('accumulation-bowl-frame');
  const bowl = bowlFrame || document.getElementById('accumulation-bowl');
  if (!bowl) return false;
  const r = bowl.getBoundingClientRect();
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 844;
  return r.bottom <= 60 || r.top >= screenH;
}

export function measureCompletionFlight(
  habitId: string,
  customOrigin?: { x: number; y: number; touchRatio?: number },
  isBowlOffscreen?: boolean
): { from: { x: number; y: number }; to: { x: number; y: number }; touchRatio: number } {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 390;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 844;

  let fromX: number;
  let fromY: number;
  let touchRatio = customOrigin && Number.isFinite(customOrigin.touchRatio) ? customOrigin.touchRatio! : 0.5;

  if (customOrigin && Number.isFinite(customOrigin.x) && Number.isFinite(customOrigin.y) && customOrigin.x !== 0 && customOrigin.y !== 0) {
    fromX = customOrigin.x;
    fromY = customOrigin.y;
  } else {
    const card = document.getElementById(`habit-card-${habitId}`);
    if (card) {
      const a = card.getBoundingClientRect();
      fromX = a.left + a.width * 0.5;
      fromY = a.top + a.height * 0.5;
      if (!Number.isFinite(customOrigin?.touchRatio) && customOrigin && Number.isFinite(customOrigin.x) && a.width > 0) {
        touchRatio = (customOrigin.x - a.left) / a.width;
      }
    } else {
      fromX = screenW * 0.5;
      fromY = screenH * 0.65;
    }
  }

  touchRatio = Math.max(0, Math.min(1, touchRatio));

  const offscreen = isBowlOffscreen ?? isBowlElementOffscreen();

  let toX: number;
  let toY: number;

  if (offscreen) {
    const ghostTarget = typeof document !== 'undefined' ? document.getElementById('scrolled-bowl-target') : null;
    if (ghostTarget) {
      const gr = ghostTarget.getBoundingClientRect();
      toX = gr.left + gr.width * 0.5 + (Math.random() - 0.5) * 4;
      toY = gr.top + gr.height * 0.5;
    } else {
      // Default top-right floating ghost overlay coordinates (fixed top-4 right-4)
      toX = Math.max(40, screenW - 56) + (Math.random() - 0.5) * 4;
      toY = 32;
    }
  } else {
    // Small lateral jitter only — keep Y on the rim so the drop stays vertical.
    const rimJitterX = (Math.random() - 0.5) * 10;
    toX = screenW * 0.5 + rimJitterX;
    // Fallback: bowl rim visual height ≈ 35% of screen height
    toY = screenH * 0.35;

    const b = getCachedBowlRect();
    if (b) {
      toX = b.left + b.width * 0.5 + rimJitterX;
      toY = b.top + b.height * 0.2;
    }
  }

  return {
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    touchRatio,
  };
}
