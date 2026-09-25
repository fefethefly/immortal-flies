// Homepage choreography, not a claim about the neural model's motor output.
export const FLIGHT_CYCLE = 26;
export const FLY_FOOT_Y = -0.48;
const tau = Math.PI * 2;
const ease = (x) => x * x * (3 - 2 * x);
const mix = (a, b, t) => a + (b - a) * t;

export function sampleFlyMotion(time, reduced = false) {
  if (reduced)
    return {
      x: 0,
      height: 0,
      flight: 0,
      walk: 0,
      yaw: 0,
      bank: 0,
      phase: "rest",
    };
  const t = ((time % FLIGHT_CYCLE) + FLIGHT_CYCLE) % FLIGHT_CYCLE;
  if (t < 5)
    return {
      x: mix(-0.3, 0.3, t / 5),
      height: 0,
      flight: 0,
      walk: 1,
      yaw: 0,
      bank: 0,
      phase: "walk",
    };
  if (t < 6.4) {
    const p = (t - 5) / 1.4,
      s = ease(p);
    return {
      x: mix(0.3, 0.4, s),
      height: 0.7 * s,
      flight: ease(Math.min(1, p * 2.6)),
      walk: 1 - s,
      yaw: 0,
      bank: Math.sin(p * Math.PI) * 0.08,
      phase: "takeoff",
    };
  }
  if (t < 13) {
    const p = (t - 6.4) / 6.6;
    const turn = ease(Math.max(0, Math.min(1, (p - 0.35) / 0.3)));
    return {
      x: 0.4 + 0.55 * Math.sin(p * Math.PI),
      height: 0.7 + 0.38 * Math.sin(p * Math.PI),
      flight: 1,
      walk: 0,
      yaw: Math.PI * turn,
      bank: -Math.sin(p * tau) * 0.12,
      phase: "flight",
    };
  }
  if (t < 15) {
    const p = (t - 13) / 2,
      s = ease(p);
    return {
      x: mix(0.4, -0.3, s),
      height: 0.7 * (1 - s),
      flight: 1 - ease(Math.max(0, (p - 0.7) / 0.3)),
      walk: ease(Math.max(0, (p - 0.8) / 0.2)),
      yaw: Math.PI,
      bank: -Math.sin(p * Math.PI) * 0.065,
      phase: "landing",
    };
  }
  if (t < 21) {
    const p = t - 15;
    const before = Math.min(1, p / 2);
    const after = Math.max(0, p - 5);
    const paused = p >= 2 && p < 5;
    return {
      x: mix(-0.3, -0.45, ease(before)) - 0.15 * ease(after),
      height: 0,
      flight: 0,
      walk: paused
        ? 0
        : p < 2
          ? ease(Math.min(1, (2 - p) / 0.4))
          : Math.sin(after * Math.PI) ** 2,
      groom: paused ? Math.sin(((p - 2) / 3) * Math.PI) ** 2 : 0,
      yaw: Math.PI,
      bank: 0,
      phase: paused ? "groom" : "walk",
    };
  }
  if (t < 23) {
    const p = (t - 21) / 2;
    return {
      x: -0.6,
      height: 0,
      flight: 0,
      walk: Math.sin(p * Math.PI) ** 2 * 0.35,
      yaw: mix(Math.PI, tau, ease(p)),
      bank: 0,
      phase: "turn",
    };
  }
  return {
    x: mix(-0.6, -0.3, (t - 23) / 3),
    height: 0,
    flight: 0,
    walk: ease(Math.min(1, (t - 23) / 0.3)),
    yaw: tau,
    bank: 0,
    phase: "walk",
  };
}

// Alternating tripod gait. During stance the foot stays on the floor; the
// second half of the cycle lifts it and returns it for the next step.
export function sampleLegStep(time, leg, side, walk, flight) {
  const phase = time * 0.95 + (leg === 1 ? 0.5 : 0) + (side < 0 ? 0.5 : 0);
  const p = ((phase % 1) + 1) % 1;
  const swing = p > 0.5;
  const x =
    walk *
    (swing ? mix(-0.035, 0.035, (p - 0.5) * 2) : mix(0.035, -0.035, p * 2));
  const lift = walk * (swing ? Math.sin((p - 0.5) * tau) * 0.065 : 0);
  return { x, y: FLY_FOOT_Y + lift + flight * 0.24, folded: flight };
}
