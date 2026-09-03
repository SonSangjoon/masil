const JANGGI_MOVE_PICKUP_END = 0.14;
const JANGGI_CAPTURE_IMPACT = 0.72;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp01((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

export function janggiMoveTravel(moveProgress: number) {
  return smoothstep(JANGGI_MOVE_PICKUP_END, JANGGI_CAPTURE_IMPACT, moveProgress);
}
