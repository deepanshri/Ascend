import React, { Suspense, useEffect, useState } from 'react';
import { useBowl, useBowlActions } from '../providers/BowlProvider';

// three.js arrives with this chunk (and with the bowl), never in the startup bundle.
const FlyingPieceOverlay = React.lazy(() => import('../components/FlyingPieceOverlay'));

/** After first paint, once the app has settled. */
const OVERLAY_WARMUP_MS = 2000;

/**
 * The completion-flight overlay, mounted once (shortly after startup, or at the
 * first flight if that comes sooner) and then kept: a single WebGL context
 * serves every flight, so no completion pays for loading or creating it.
 */
export function FlightLayer() {
  const { pieceFlights } = useBowl();
  const { onFlightComplete } = useBowlActions();
  const [armed, setArmed] = useState(false);
  const hasFlight = pieceFlights.length > 0;

  useEffect(() => {
    if (armed) return;
    if (hasFlight) {
      setArmed(true);
      return;
    }
    const timer = window.setTimeout(() => setArmed(true), OVERLAY_WARMUP_MS);
    return () => window.clearTimeout(timer);
  }, [armed, hasFlight]);

  if (!armed) return null;
  return (
    <Suspense fallback={null}>
      <FlyingPieceOverlay flights={pieceFlights} onFlightComplete={onFlightComplete} />
    </Suspense>
  );
}
