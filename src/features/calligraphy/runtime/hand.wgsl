// Updates one brush and next-frame ROI per GPU-resident [1,63] landmark tensor.
// Landmark x/y values are crop pixels on [0,224], and no landmark is read back.

struct Uniforms {
  source: vec2f,
  display: vec2f,
  presence: vec2f,
  ran: vec2f,
  dt: f32,
  enter_confidence: f32,
  stay_confidence: f32,
  ema_tau: f32,
  max_jump: f32,
  reset: f32,
  crop_size: f32,
  loopback_scale: f32,
};

struct BrushState {
  prev: vec2f,
  current: vec2f,
  confidence: f32,
  tracking: f32,
  invalid: f32,
  has_prev: f32,
  stroke: f32,
  radius: f32,
  prev_radius: f32,
  openness: f32,
};

struct Roi {
  center: vec2f,
  size: f32,
  rotation: f32,
};

// Binding array lengths must be literals for vgpu reflection.
const BRUSH_COUNT: u32 = 2u;
const NUM_LANDMARKS: u32 = 21u;
const INVALID_RESET: f32 = 2.0;
const MAX_DT: f32 = 0.1;
const TARGET_ANGLE: f32 = 1.5707963267948966;
const TAU: f32 = 6.283185307179586;

/// Wrist and middle-finger MCP: the landmark model's own hand axis.
const AXIS_START: u32 = 0u;
const AXIS_END: u32 = 9u;
// Only a nearly flat palm lifts the brush. The smaller regrip threshold adds
// a narrow hysteresis band so the tip does not chatter at the paper boundary.
const OPEN_PALM_LIFT_THRESHOLD: f32 = 0.88;
const HAND_REGRIP_THRESHOLD: f32 = 0.78;
const MIN_BRUSH_RADIUS: f32 = 5.0;
const MAX_BRUSH_RADIUS: f32 = 24.0;
const BRUSH_TIP_OFFSET_SCALE: f32 = 1.15;
const MIN_BRUSH_TIP_OFFSET: f32 = 42.0;
const MAX_BRUSH_TIP_OFFSET: f32 = 120.0;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> lm0: array<f32>;
@group(0) @binding(2) var<storage, read> lm1: array<f32>;
@group(0) @binding(3) var<storage, read_write> rois: array<Roi, 3>;
@group(0) @binding(4) var<storage, read_write> brushes: array<BrushState, 2>;

// WGSL cannot dynamically index across the two landmark bindings.
fn landmark_xy(slot: u32, index: u32) -> vec2f {
  let base = index * 3u;
  if (slot == 0u) {
    return vec2f(lm0[base], lm0[base + 1u]);
  }
  return vec2f(lm1[base], lm1[base + 1u]);
}

// Crop pixels to source pixels, matching hand-crop.wgsl.
fn crop_to_source(point_crop: vec2f, roi: Roi) -> vec2f {
  let c = cos(roi.rotation);
  let s = sin(roi.rotation);
  let d = (point_crop / max(uniforms.crop_size, 1.0) - vec2f(0.5)) * roi.size;
  return roi.center + vec2f(d.x * c - d.y * s, d.x * s + d.y * c);
}

fn normalise_angle(a: f32) -> f32 {
  return a - TAU * floor((a + 3.141592653589793) / TAU);
}

fn in_unit(v: vec2f) -> bool {
  return all(v >= vec2f(0.0)) && all(v <= vec2f(1.0));
}

// Invert composite.wgsl's mirrored cover transform. Without this correction,
// a portrait or ultrawide canvas shows the brush beside the visible hand.
fn source_to_display(source_norm: vec2f) -> vec2f {
  let source_aspect = uniforms.source.x / max(uniforms.source.y, 1.0);
  let display_aspect = uniforms.display.x / max(uniforms.display.y, 1.0);
  let mirrored = vec2f(1.0 - source_norm.x, source_norm.y);
  if (display_aspect > source_aspect) {
    return vec2f(
      mirrored.x,
      (mirrored.y - 0.5) * (source_aspect / display_aspect) + 0.5
    );
  }
  return vec2f(
    (mirrored.x - 0.5) * (display_aspect / source_aspect) + 0.5,
    mirrored.y
  );
}

// Builds the next crop around all landmarks and rotates the hand upright.
fn next_roi(slot: u32) -> Roi {
  let start = crop_to_source(landmark_xy(slot, AXIS_START), rois[slot]);
  let end = crop_to_source(landmark_xy(slot, AXIS_END), rois[slot]);
  let rotation = normalise_angle(TARGET_ANGLE - atan2(-(end.y - start.y), end.x - start.x));

  var lo = vec2f(1e30);
  var hi = vec2f(-1e30);
  for (var i = 0u; i < NUM_LANDMARKS; i = i + 1u) {
    let p = crop_to_source(landmark_xy(slot, i), rois[slot]);
    lo = min(lo, p);
    hi = max(hi, p);
  }
  let extent = hi - lo;
  var roi: Roi;
  roi.center = (lo + hi) * 0.5;
  roi.size = max(extent.x, extent.y) * uniforms.loopback_scale;
  roi.rotation = rotation;
  return roi;
}

// Mean MCP knuckle position in source pixels.
fn mcp_centroid(slot: u32) -> vec2f {
  var sum = vec2f(0.0);
  sum = sum + crop_to_source(landmark_xy(slot, 5u), rois[slot]);
  sum = sum + crop_to_source(landmark_xy(slot, 9u), rois[slot]);
  sum = sum + crop_to_source(landmark_xy(slot, 13u), rois[slot]);
  sum = sum + crop_to_source(landmark_xy(slot, 17u), rois[slot]);
  return sum * 0.25;
}

// The tracked point is the hand's stable knuckle centroid. Put the working tip
// above it by roughly one palm length so the composited brush appears held by
// the person instead of sitting underneath their fist.
fn brush_tip(slot: u32) -> vec2f {
  let centroid = mcp_centroid(slot);
  let wrist = crop_to_source(landmark_xy(slot, AXIS_START), rois[slot]);
  let palm_length = distance(centroid, wrist);
  let offset = clamp(
    palm_length * BRUSH_TIP_OFFSET_SCALE,
    MIN_BRUSH_TIP_OFFSET,
    MAX_BRUSH_TIP_OFFSET
  );
  let tip_px = centroid + vec2f(0.0, -offset);
  let source_norm = tip_px / max(uniforms.source, vec2f(1.0));
  return source_to_display(source_norm);
}

// A fingertip moves back toward the wrist when that finger curls into a fist.
// Comparing it with the finger's PIP joint makes the score independent of the
// hand's distance from the camera. The thumb stays available for brush-width
// control and is intentionally excluded from the pen-up gesture.
fn finger_openness(slot: u32, pip: u32, tip: u32) -> f32 {
  let wrist = landmark_xy(slot, AXIS_START);
  let pip_distance = max(distance(landmark_xy(slot, pip), wrist), 1.0);
  let tip_distance = distance(landmark_xy(slot, tip), wrist);
  return smoothstep(1.02, 1.22, tip_distance / pip_distance);
}

fn hand_openness(slot: u32) -> f32 {
  return (
    finger_openness(slot, 6u, 8u) +
    finger_openness(slot, 10u, 12u) +
    finger_openness(slot, 14u, 16u) +
    finger_openness(slot, 18u, 20u)
  ) * 0.25;
}

// A closed fist presses the broadest part of the virtual brush into the paper.
// Opening the hand progressively releases that pressure until a flat palm
// lifts the brush completely.
fn brush_radius(openness: f32) -> f32 {
  let pressure = 1.0 - smoothstep(0.08, OPEN_PALM_LIFT_THRESHOLD, openness);
  return mix(MIN_BRUSH_RADIUS, MAX_BRUSH_RADIUS, pressure);
}

fn update_brush(
  state_in: BrushState,
  measured: vec2f,
  measured_radius: f32,
  openness: f32,
  score: f32,
  valid_in: bool
) -> BrushState {
  var state = state_in;

  if (uniforms.reset > 0.5) {
    state.has_prev = 0.0;
    state.radius = 0.0;
    state.prev_radius = 0.0;
  }
  state.stroke = 0.0;

  // Starting a track requires more confidence than continuing one.
  let threshold = select(uniforms.enter_confidence, uniforms.stay_confidence, state.tracking > 0.5);
  let valid = valid_in && score >= threshold && in_unit(measured);

  if (!valid) {
    state.invalid = state.invalid + 1.0;
    state.confidence = max(score, 0.0);
    if (state.invalid >= INVALID_RESET) {
      // Break continuity before reacquiring elsewhere.
      state.tracking = 0.0;
      state.has_prev = 0.0;
    }
    return state;
  }

  state.invalid = 0.0;
  state.confidence = score;

  // Time-aware smoothing stays stable across inference rates.
  let alpha = 1.0 - exp(-clamp(uniforms.dt, 0.0, MAX_DT) / max(uniforms.ema_tau, 1e-4));
  let radius_alpha = 1.0 - exp(-clamp(uniforms.dt, 0.0, MAX_DT) / 0.14);
  let pose_alpha = 1.0 - exp(-clamp(uniforms.dt, 0.0, MAX_DT) / 0.09);
  state.openness = select(
    mix(state.openness, openness, pose_alpha),
    openness,
    state.tracking < 0.5
  );
  let previous_radius = state.radius;
  state.radius = select(
    mix(state.radius, measured_radius, radius_alpha),
    measured_radius,
    state.radius <= 0.0
  );
  var smoothed = measured;
  if (state.tracking > 0.5) {
    smoothed = mix(state.current, measured, alpha);
  }

  // A fully opened palm lifts the brush. Closing it again below the nearby
  // regrip threshold starts a fresh stroke without reconnecting the gap.
  let was_engaged = state.has_prev > 0.5;
  let gesture_threshold = select(
    HAND_REGRIP_THRESHOLD,
    OPEN_PALM_LIFT_THRESHOLD,
    was_engaged
  );
  if (openness >= gesture_threshold) {
    state.prev = smoothed;
    state.current = smoothed;
    state.prev_radius = state.radius;
    state.tracking = 1.0;
    state.has_prev = 0.0;
    state.stroke = 0.0;
    return state;
  }

  if (state.tracking > 0.5 && distance(smoothed, state.current) > uniforms.max_jump) {
    // Keep the track after an implausible jump, but break the painted line.
    state.prev = measured;
    state.current = measured;
    state.prev_radius = state.radius;
    state.has_prev = 0.0;
    return state;
  }

  if (state.tracking > 0.5 && state.has_prev > 0.5) {
    state.prev = state.current;
    state.current = smoothed;
    state.prev_radius = select(
      state.radius,
      previous_radius,
      previous_radius > 0.0
    );
    state.stroke = 1.0;
    return state;
  }

  // Seed continuity without painting on acquisition.
  state.prev = smoothed;
  state.current = smoothed;
  state.prev_radius = state.radius;
  state.tracking = 1.0;
  state.has_prev = 1.0;
  return state;
}

@compute @workgroup_size(2)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let slot = gid.x;
  if (slot >= BRUSH_COUNT) {
    return;
  }

  let ran = select(uniforms.ran.x, uniforms.ran.y, slot == 1u) > 0.5;
  let presence = select(uniforms.presence.x, uniforms.presence.y, slot == 1u);

  var measured = vec2f(0.0);
  var measured_radius = 20.0;
  var openness = 0.0;
  var valid = false;
  var hand_valid = false;
  if (ran) {
    let source_norm = mcp_centroid(slot) / max(uniforms.source, vec2f(1.0));
    hand_valid = in_unit(source_norm);
    openness = hand_openness(slot);
    measured_radius = brush_radius(openness);
    measured = brush_tip(slot);
    valid = hand_valid && in_unit(measured);

    // Reject a diverged loopback ROI so the detector can reacquire.
    if (hand_valid && presence >= uniforms.stay_confidence) {
      let candidate = next_roi(slot);
      let short_side = min(uniforms.source.x, uniforms.source.y);
      let fraction = candidate.size / max(short_side, 1.0);
      if (fraction > 0.02 && fraction < 2.5) {
        rois[slot] = candidate;
      }
    }
  }

  brushes[slot] = update_brush(
    brushes[slot],
    measured,
    measured_radius,
    openness,
    presence,
    valid
  );
}
