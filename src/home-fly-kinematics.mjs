import { FLY_FOOT_Y, sampleLegStep } from "./home-flight-motion.mjs";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;

// A fixed-length two-bone chain; bend is a preferred direction, not a joint
// position. Project it onto the plane perpendicular to the hip-to-foot axis.
export function solveFlyLeg(hip, target, bend, upper = 0.31, lower = 0.34) {
  const delta = target.map((v, i) => v - hip[i]);
  const distance = Math.hypot(...delta);
  const axis = distance > 1e-9 ? delta.map((v) => v / distance) : [0, -1, 0];
  const reach = clamp(
    distance,
    Math.abs(upper - lower) + 1e-6,
    upper + lower - 1e-6,
  );
  const dot = bend.reduce((sum, v, i) => sum + v * axis[i], 0);
  let perpendicular = bend.map((v, i) => v - dot * axis[i]);
  let length = Math.hypot(...perpendicular);
  if (length < 1e-8) {
    const fallback = Math.abs(axis[0]) < 0.8 ? [1, 0, 0] : [0, 0, 1];
    const projection = fallback.reduce((sum, v, i) => sum + v * axis[i], 0);
    perpendicular = fallback.map((v, i) => v - projection * axis[i]);
    length = Math.hypot(...perpendicular);
  }
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return {
    knee: hip.map(
      (v, i) => v + axis[i] * along + (perpendicular[i] / length) * height,
    ),
    foot: hip.map((v, i) => v + axis[i] * reach),
  };
}

// Authored articulation is separate from the simulated motor action. No
// animation phase, breathing value or grooming gesture is neural telemetry.
export function sampleFlyGesture(
  time,
  {
    flight = 0,
    walk = 0,
    groom = 0,
    compression = 0,
    turn = 0,
    action = "REST",
    reduced = false,
  } = {},
) {
  const t = reduced ? 0 : time;
  const idle = (1 - flight) * (1 - walk);
  return {
    bob: reduced
      ? 0
      : Math.sin(t * 2.1) * 0.004 +
        Math.sin(t * 11.94) * walk * 0.009 -
        compression * 0.04,
    pitch: reduced ? 0 : Math.sin(t * 1.3) * 0.015 - flight * 0.04,
    headYaw:
      clamp(turn, -0.3, 0.3) + (reduced ? 0 : Math.sin(t * 0.83) * idle * 0.07),
    headPitch:
      (action === "AVOID" ? -0.07 : action === "FORAGE" ? 0.055 : 0) +
      groom * 0.1,
    tailYaw: -clamp(turn * 0.55, -0.16, 0.16),
    tailPitch: reduced ? 0 : Math.sin(t * 1.6 - 0.9) * 0.025 + flight * 0.07,
    groom: reduced ? 0 : groom * (1 - flight),
    breath: reduced ? 1 : 1 + Math.sin(t * 1.9) * 0.018,
  };
}

export function flyFootTarget(
  time,
  leg,
  side,
  { walk = 0, flight = 0, groom = 0 } = {},
) {
  const step = sampleLegStep(time, leg, side, walk, flight);
  const target = [
    [0.43, -0.015, -0.47][leg] + step.x - flight * 0.07,
    step.y,
    side * ([0.22, 0.29, 0.235][leg] - flight * 0.1),
  ];
  if (leg === 0 && groom > 0) {
    const rub = Math.sin(time * 14 + side * 0.7);
    target[0] = mix(target[0], 0.49 + rub * 0.024, groom);
    target[1] = mix(FLY_FOOT_Y, -0.035 + Math.cos(time * 14) * 0.025, groom);
    target[2] = mix(target[2], side * (0.045 + rub * 0.014), groom);
  }
  return target;
}
