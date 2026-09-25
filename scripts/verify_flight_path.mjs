/**
 * Pure path checks for the completion marble flight (no DOM).
 */
const RISE_END = 0.38;
const APPROACH_END = 0.7;
const HOVER_LIFT_MIN = 52;
const HOVER_LIFT_SPAN = 28;
const BOWL_CLEAR_HALF_W = 92;
const BOWL_HALF_W = 96;
const BOWL_H = 160;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function riseSideX(p0x, rimX) {
  return p0x <= rimX ? rimX - BOWL_CLEAR_HALF_W : rimX + BOWL_CLEAR_HALF_W;
}

function flightPositionAt(p0, hover, rim, t) {
  const sideX = riseSideX(p0.x, rim.x);
  const cruiseStartX =
    p0.y > rim.y ? lerp(sideX, hover.x, 0.35) : lerp(p0.x, hover.x, 0.35);

  if (t <= RISE_END) {
    const u = t / RISE_END;
    const eased = 1 - (1 - u) * (1 - u);
    const y = lerp(p0.y, hover.y, eased);
    let x;
    if (p0.y > rim.y && y > rim.y) {
      x = lerp(p0.x, sideX, Math.min(1, eased * 1.4));
      if (Math.abs(x - rim.x) < BOWL_CLEAR_HALF_W) x = sideX;
    } else if (p0.y > rim.y) {
      x = lerp(sideX, hover.x, eased * 0.35);
    } else {
      x = lerp(p0.x, hover.x, eased * 0.35);
    }
    return { x, y };
  }
  if (t <= APPROACH_END) {
    const u = (t - RISE_END) / (APPROACH_END - RISE_END);
    const eased = u * u * (3 - 2 * u);
    return {
      x: lerp(cruiseStartX, hover.x, eased),
      y: hover.y,
    };
  }
  const u = (t - APPROACH_END) / (1 - APPROACH_END);
  const eased = u * u;
  return {
    x: rim.x,
    y: lerp(hover.y, rim.y, eased),
  };
}

function simulate(from, rim, seed = 0.4) {
  const hoverLift = HOVER_LIFT_MIN + seed * HOVER_LIFT_SPAN;
  const hover = { x: rim.x, y: rim.y - hoverLift };
  const samples = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    samples.push({ t, ...flightPositionAt(from, hover, rim, t) });
  }
  return { hover, rim, samples };
}

let failures = 0;
const cases = [
  { name: 'from-below-right', from: { x: 320, y: 620 }, rim: { x: 205, y: 140 } },
  { name: 'from-below-left', from: { x: 80, y: 580 }, rim: { x: 205, y: 140 } },
  { name: 'from-far', from: { x: 380, y: 800 }, rim: { x: 200, y: 120 } },
  { name: 'from-near-below-bowl', from: { x: 210, y: 340 }, rim: { x: 205, y: 140 } },
  { name: 'wide-bowl-jitter', from: { x: 100, y: 700 }, rim: { x: 220, y: 160 } },
  { name: 'from-above', from: { x: 180, y: 40 }, rim: { x: 200, y: 130 } },
];

for (const c of cases) {
  for (const seed of [0, 0.5, 1]) {
    const { hover, rim, samples } = simulate(c.from, c.rim, seed);

    // No sudden jump at t=0
    const s0 = samples[0];
    if (Math.abs(s0.x - c.from.x) > 0.01 || Math.abs(s0.y - c.from.y) > 0.01) {
      failures++;
      console.error(c.name, seed, 't=0 jump', s0, c.from);
    }

    for (const s of samples) {
      const overBowl = Math.abs(s.x - rim.x) < BOWL_HALF_W * 0.85;
      const inGlassBand = s.y > rim.y + 4 && s.y < rim.y + BOWL_H;
      if (overBowl && inGlassBand && s.t < 0.999) {
        failures++;
        console.error(c.name, seed, 'CLIP through glass', s);
      }
    }

    const drop = samples.filter((s) => s.t > APPROACH_END);
    for (const s of drop) {
      if (Math.abs(s.x - rim.x) > 0.01) {
        failures++;
        console.error(c.name, seed, 'non-vertical drop', s);
      }
    }

    const cruise = samples.filter((s) => s.t > RISE_END && s.t <= APPROACH_END);
    for (const s of cruise) {
      if (Math.abs(s.y - hover.y) > 0.5) {
        failures++;
        console.error(c.name, seed, 'cruise not at hover altitude', s, hover);
      }
    }

    const end = samples[samples.length - 1];
    if (Math.abs(end.x - rim.x) > 1e-6 || Math.abs(end.y - rim.y) > 1e-6) {
      failures++;
      console.error(c.name, 'bad end', end, rim);
    }
  }
}

if (failures) {
  console.error('FAILED', failures);
  process.exit(1);
}
console.log('OK — all flight path edge cases passed');
