// MASIL adaptation of vGPU Air Painting's persistent mask compositor.
// The camera stays local and is shown as a soft visual layer behind the
// calligraphy reference; it is never uploaded or persisted.

struct Uniforms {
  resolution: vec2f,
  mask_size: vec2f,
  show_cursor: f32,
  show_camera: f32,
  cursor_radius: f32,
  grain_cell: f32,
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

const BRUSH_COUNT: u32 = 2u;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> mask: array<f32>;
@group(0) @binding(2) var<storage, read> brushes: array<BrushState, 2>;
@group(0) @binding(3) var frameTexture: texture_2d<f32>;
@group(0) @binding(4) var frameSampler: sampler;

fn mask_texel(t: vec2i) -> f32 {
  let size = vec2i(uniforms.mask_size);
  if (t.x < 0 || t.y < 0 || t.x >= size.x || t.y >= size.y) {
    return 0.0;
  }
  return mask[u32(t.y) * u32(uniforms.mask_size.x) + u32(t.x)];
}

fn mask_at(p: vec2f) -> f32 {
  if (any(p < vec2f(0.0)) || any(p > vec2f(1.0))) {
    return 0.0;
  }
  let texel = p * uniforms.mask_size - vec2f(0.5);
  let base = floor(texel);
  let f = texel - base;
  let b = vec2i(base);
  let c00 = mask_texel(b);
  let c10 = mask_texel(b + vec2i(1, 0));
  let c01 = mask_texel(b + vec2i(0, 1));
  let c11 = mask_texel(b + vec2i(1, 1));
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

fn grain(position: vec2f) -> f32 {
  let cell = floor(position / max(uniforms.grain_cell, 1.0));
  return fract(sin(dot(cell, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
}

fn hash2(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise2(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let smooth_local = local * local * (vec2f(3.0) - 2.0 * local);
  let a = hash2(cell);
  let b = hash2(cell + vec2f(1.0, 0.0));
  let c = hash2(cell + vec2f(0.0, 1.0));
  let d = hash2(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, smooth_local.x), mix(c, d, smooth_local.x), smooth_local.y);
}

fn material_noise(point: vec2f) -> f32 {
  let broad = noise2(point);
  let medium = noise2(point * 2.17 + vec2f(3.7, -1.9));
  let fine = noise2(point * 5.31 + vec2f(-4.1, 6.3));
  return broad * 0.56 + medium * 0.29 + fine * 0.15;
}

fn segment_distance(point: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let t = clamp(dot(point - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return distance(point, a + ab * t);
}

fn capsule_mask(point: vec2f, a: vec2f, b: vec2f, radius: f32) -> f32 {
  return 1.0 - smoothstep(radius - 0.8, radius + 0.8, segment_distance(point, a, b));
}

fn tapered_mask(
  point: vec2f,
  a: vec2f,
  b: vec2f,
  radius_a: f32,
  radius_b: f32
) -> f32 {
  let ab = b - a;
  let t = clamp(dot(point - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  let radius = mix(radius_a, radius_b, smoothstep(0.0, 1.0, t));
  let d = distance(point, a + ab * t);
  return 1.0 - smoothstep(radius - 0.75, radius + 0.75, d);
}

fn local_coordinate(point: vec2f, origin: vec2f, axis: vec2f) -> vec2f {
  let delta = point - origin;
  let normal = vec2f(-axis.y, axis.x);
  return vec2f(dot(delta, axis), dot(delta, normal));
}

fn range_mask(value: f32, start: f32, end: f32, softness: f32) -> f32 {
  return smoothstep(start - softness, start + softness, value) *
    (1.0 - smoothstep(end - softness, end + softness, value));
}

fn smootherstep_range(value: f32, start: f32, end: f32) -> f32 {
  let t = clamp((value - start) / max(end - start, 1e-4), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn composite_brush(base: vec3f, point: vec2f, brush: BrushState) -> vec3f {
  // While writing, the handle reaches toward one o'clock so the bristle tip
  // leads at seven. When lifted, it only relaxes to a two-to-eight diagonal;
  // the tip also floats away from the contact point instead of rotating flat.
  // The pose, shape, placement and fade deliberately use staggered easing.
  // On release the brush relaxes before becoming a ghost; on engagement the
  // ghost gains presence and finds the contact point before loading its hair.
  let pose_lift = smootherstep_range(brush.openness, 0.22, 0.96);
  let lift = smootherstep_range(brush.openness, 0.30, 0.90);
  let placement_lift = smootherstep_range(brush.openness, 0.46, 0.98);
  let fade_lift = smootherstep_range(brush.openness, 0.54, 0.98);
  let pressure = 1.0 - lift;
  let resting_axis = vec2f(0.8660254, -0.5);
  let angle = mix(-1.04719755, -0.52359878, pose_lift);
  let axis = vec2f(cos(angle), sin(angle));
  let normal = vec2f(-axis.y, axis.x);
  // Correct the fixed paint-mask coordinates for a non-16:9 canvas so the
  // brush retains its proportions and the one-o'clock pose on screen.
  let mask_to_display = uniforms.resolution / max(uniforms.mask_size, vec2f(1.0));
  let aspect = vec2f(mask_to_display.x / max(mask_to_display.y, 1e-4), 1.0);
  let display_point = point * aspect;
  let tracked_point = brush.current * uniforms.mask_size * aspect;
  let scale = clamp(0.84 + brush.radius / 120.0, 0.86, 1.06);
  // Traditional proportions: a long, slender handle; a compact horn-and-brass
  // ferrule; and a full hair belly that returns to a fine point when lifted.
  let bristle_length = mix(29.0, 37.0, lift) * scale;
  let bristle_tip_radius = mix(2.35, 0.48, lift) * scale;
  let bristle_base_radius = mix(8.8, 7.0, lift) * scale;
  let ferrule_length = mix(10.0, 11.0, lift) * scale;
  let ferrule_radius = mix(7.5, 6.7, lift) * scale;
  let handle_radius = mix(4.45, 4.0, lift) * scale;
  let handle_length = mix(102.0, 110.0, lift) * scale;
  // In the resting pose the hair tip hovers a short distance up the two-o'clock
  // axis. Pressing brings that visible tip down to the exact painted point.
  let rest_shift = (
    resting_axis * 20.0 * scale + vec2f(0.0, -4.0 * scale)
  ) * placement_lift;
  let tip = tracked_point + rest_shift;
  let bristle_base = tip + axis * bristle_length;
  let ferrule_end = bristle_base + axis * ferrule_length;
  let handle_end = ferrule_end + axis * handle_length;
  let opacity = mix(1.0, 0.16, fade_lift);

  let hair_local = local_coordinate(display_point, tip, axis);
  let hair_t = clamp(hair_local.x / max(bristle_length, 1e-4), 0.0, 1.0);
  // Pressure broadens the working point and curves the hair belly. Both return
  // continuously to a long, fine tuft as the brush leaves the paper.
  let hair_curve = sin(hair_t * 3.14159265) * 3.25 * pressure * scale;
  let tip_belly = exp(-pow((hair_t - 0.17) / 0.19, 2.0));
  let hair_noise = material_noise(vec2f(
    hair_t * 7.4,
    (hair_local.y - hair_curve) * 0.31
  ));
  let hair_width = mix(
    bristle_tip_radius,
    bristle_base_radius,
    pow(hair_t, 0.58)
  ) + tip_belly * 1.25 * pressure * scale + (hair_noise - 0.5) * 0.48 * scale;
  let hair_range = range_mask(
    hair_local.x,
    -0.8 * scale,
    bristle_length + 0.25 * scale,
    0.85 * scale
  );
  let hair_distance = abs(hair_local.y - hair_curve);
  let bristles = hair_range * (
    1.0 - smoothstep(hair_width - 0.65, hair_width + 0.72, hair_distance)
  );
  let bristle_outline = hair_range * (
    1.0 - smoothstep(hair_width + 0.30, hair_width + 1.45, hair_distance)
  );

  var color = base;
  let shadow_point = display_point - vec2f(3.0, 4.0) * scale;
  let brush_shadow = max(
    tapered_mask(
      shadow_point,
      tip,
      bristle_base,
      bristle_tip_radius + 3.0 * scale,
      bristle_base_radius + 3.0 * scale
    ),
    max(
      capsule_mask(
        shadow_point,
        bristle_base,
        ferrule_end,
        ferrule_radius + 2.7 * scale
      ),
      capsule_mask(
        shadow_point,
        ferrule_end,
        handle_end,
        handle_radius + 2.5 * scale
      )
    )
  );
  let shadow_strength = mix(0.18, 0.055, fade_lift);
  color = mix(color, color * 0.55, brush_shadow * shadow_strength * opacity);

  // Clean ivory-jade handle: an off-white translucent body keeps the mineral
  // depth of the Janggi pieces without the previous muddy amber cast.
  let handle_local = local_coordinate(display_point, ferrule_end, axis);
  let handle_t = clamp(
    handle_local.x / max(handle_length, 1e-4),
    0.0,
    1.0
  );
  let local_handle_radius = mix(
    handle_radius * 1.03,
    handle_radius * 0.83,
    smootherstep_range(handle_t, 0.08, 0.94)
  );
  let handle_range = range_mask(
    handle_local.x,
    -0.4 * scale,
    handle_length + 0.25 * scale,
    0.85 * scale
  );
  let handle = handle_range * (
    1.0 - smoothstep(
      local_handle_radius - 0.62,
      local_handle_radius + 0.68,
      abs(handle_local.y)
    )
  );
  let handle_outline = handle_range * (
    1.0 - smoothstep(
      local_handle_radius + 0.28,
      local_handle_radius + 1.35 * scale,
      abs(handle_local.y)
    )
  );
  let handle_cross = clamp(
    handle_local.y / max(local_handle_radius, 1e-4),
    -1.0,
    1.0
  );
  let handle_round = sqrt(max(1.0 - handle_cross * handle_cross, 0.0));
  let jade_noise = material_noise(
    vec2f(handle_local.x * 0.055, handle_local.y * 0.22) + vec2f(2.3, -5.7)
  );
  let broad_cloud = sin(
    handle_local.x * 0.115 +
    handle_local.y * 0.46 +
    sin(handle_local.x * 0.047) * 1.55
  );
  let fine_cloud = sin(
    handle_local.x * 0.31 -
    handle_local.y * 0.82 +
    jade_noise * 3.1
  );
  let jade_cloud = broad_cloud * 0.52 +
    fine_cloud * 0.22 +
    (jade_noise - 0.5) * 0.52;
  let stone_line = pow(max(1.0 - abs(sin(
    handle_local.x * 0.17 -
    handle_local.y * 0.44 +
    jade_cloud * 2.35
  )), 0.0), 13.0);
  let ivory_jade_dark = vec3f(0.285, 0.272, 0.238);
  let ivory_jade = vec3f(0.76, 0.735, 0.665);
  let ivory_jade_light = vec3f(1.0, 0.982, 0.91);
  var handle_material = mix(
    ivory_jade_dark,
    ivory_jade,
    0.58 + jade_cloud * 0.11 + handle_round * 0.19
  );
  handle_material = mix(
    handle_material,
    ivory_jade_light,
    stone_line * 0.18
  );
  let jade_fresnel = pow(abs(handle_cross), 2.65);
  let inner_glow = pow(max(1.0 - abs(handle_cross), 0.0), 2.2);
  handle_material *= 0.79 + handle_round * 0.22;
  handle_material += ivory_jade_light *
    (inner_glow * 0.10 + jade_fresnel * 0.075);
  let lacquer_line = pow(
    max(1.0 - abs(handle_cross + 0.32), 0.0),
    19.0
  );
  handle_material += vec3f(1.0, 0.995, 0.95) * lacquer_line * 0.34;
  let node_distance = min(
    abs(handle_local.x - handle_length * 0.34),
    abs(handle_local.x - handle_length * 0.72)
  );
  let carved_ring = 1.0 - smoothstep(0.55 * scale, 1.25 * scale, node_distance);
  let handle_alpha = opacity * mix(0.60, 0.91, jade_fresnel);
  let transmitted_handle = mix(
    base * vec3f(1.0, 0.992, 0.95),
    handle_material,
    0.68
  );
  color = mix(
    color,
    ivory_jade_dark,
    handle_outline * 0.46 * opacity
  );
  color = mix(color, transmitted_handle, handle * handle_alpha);
  color = mix(
    color,
    ivory_jade_dark * 0.72 + ivory_jade_light * 0.16,
    carved_ring * handle * 0.42 * opacity
  );
  let end_ring = (
    1.0 - smoothstep(
      0.55 * scale,
      1.35 * scale,
      abs(handle_local.x - (handle_length - 3.7 * scale))
    )
  ) * handle;
  color = mix(color, vec3f(0.25, 0.23, 0.19), end_ring * 0.58 * opacity);
  let pommel = 1.0 - smoothstep(
    handle_radius * 0.64,
    handle_radius * 1.08,
    distance(display_point, handle_end)
  );
  color = mix(
    color,
    ivory_jade_dark + vec3f(lacquer_line * 0.13),
    pommel * 0.52 * opacity
  );

  // A restrained champagne ferrule separates the pale jade from the hair while
  // preserving the crafted, dimensional attachment point.
  let ferrule_local = local_coordinate(display_point, bristle_base, axis);
  let ferrule = capsule_mask(
    display_point,
    bristle_base,
    ferrule_end,
    ferrule_radius
  );
  let ferrule_outline = capsule_mask(
    display_point,
    bristle_base,
    ferrule_end,
    ferrule_radius + 1.05 * scale
  );
  let ferrule_cross = clamp(
    ferrule_local.y / max(ferrule_radius, 1e-4),
    -1.0,
    1.0
  );
  let ferrule_round = sqrt(max(1.0 - ferrule_cross * ferrule_cross, 0.0));
  let metal_noise = material_noise(
    vec2f(ferrule_local.x * 0.42, ferrule_local.y * 0.46) + vec2f(-1.7, 8.1)
  );
  var ferrule_material = mix(
    vec3f(0.20, 0.185, 0.155),
    vec3f(0.74, 0.675, 0.53),
    0.22 + ferrule_round * 0.56 + metal_noise * 0.10
  );
  let metal_glint = pow(
    max(1.0 - abs(ferrule_cross + 0.25), 0.0),
    24.0
  );
  ferrule_material += vec3f(1.0, 0.94, 0.74) * metal_glint * 0.30;
  let patina = smoothstep(0.69, 0.88, metal_noise) * (0.35 + lift * 0.2);
  ferrule_material = mix(
    ferrule_material,
    vec3f(0.23, 0.29, 0.25),
    patina * 0.18
  );
  color = mix(
    color,
    vec3f(0.13, 0.115, 0.095),
    ferrule_outline * 0.82 * opacity
  );
  color = mix(color, ferrule_material, ferrule * opacity);
  let groove_distance = min(
    abs(ferrule_local.x - 2.05 * scale),
    abs(ferrule_local.x - (ferrule_length - 2.05 * scale))
  );
  let ferrule_groove = (
    1.0 - smoothstep(0.28 * scale, 0.78 * scale, groove_distance)
  ) * ferrule;
  color = mix(
    color,
    vec3f(0.25, 0.215, 0.165),
    ferrule_groove * 0.62 * opacity
  );

  // Bright ivory goat-hair makes the ink-loaded working third unmistakable.
  // The irregular boundary and wet highlight keep the transition organic.
  color = mix(
    color,
    vec3f(0.085, 0.072, 0.058),
    bristle_outline * 0.76 * opacity
  );
  let hair_cross = clamp(
    (hair_local.y - hair_curve) / max(hair_width, 1e-4),
    -1.0,
    1.0
  );
  let hair_round = sqrt(max(1.0 - hair_cross * hair_cross, 0.0));
  let strand_wave = 0.5 + 0.5 * sin(
    (hair_local.y - hair_curve) * 3.45 + hair_t * 7.8 + hair_noise * 2.9
  );
  let filament = pow(strand_wave, 7.0);
  let natural_hair = mix(
    vec3f(0.49, 0.43, 0.35),
    vec3f(0.89, 0.84, 0.73),
    0.34 + hair_noise * 0.36 + hair_round * 0.24
  );
  var hair_material = natural_hair;
  hair_material *= 0.80 + hair_round * 0.24;
  hair_material += vec3f(0.96, 0.91, 0.80) * filament * 0.20;
  let ink_boundary_noise = noise2(
    vec2f((hair_local.y - hair_curve) * 0.34, 9.7)
  );
  let ink_boundary = 0.33 + (ink_boundary_noise - 0.5) * 0.085;
  let inked = 1.0 - smoothstep(
    ink_boundary - 0.016,
    ink_boundary + 0.021,
    hair_t
  );
  let inked_hair = vec3f(0.008, 0.009, 0.010) +
    vec3f(0.074, 0.068, 0.061) * filament * 0.22;
  hair_material = mix(
    hair_material,
    inked_hair,
    inked * mix(0.90, 1.0, pressure)
  );
  let ink_meniscus = 1.0 - smoothstep(
    0.012,
    0.038,
    abs(hair_t - ink_boundary)
  );
  hair_material = mix(
    hair_material,
    vec3f(0.012, 0.013, 0.014),
    ink_meniscus * 0.58
  );
  let wet_glint = pow(max(1.0 - abs(hair_cross + 0.27), 0.0), 21.0) *
    pressure * inked * (1.0 - smoothstep(0.05, 0.31, hair_t));
  hair_material += vec3f(0.24, 0.22, 0.19) * wet_glint * 0.24;
  color = mix(color, hair_material, bristles * opacity);

  return color;
}

fn camera_uv(uv: vec2f, resolution: vec2f) -> vec2f {
  let frameSize = vec2f(textureDimensions(frameTexture));
  let outputAspect = resolution.x / max(resolution.y, 1.0);
  let frameAspect = frameSize.x / max(frameSize.y, 1.0);
  var fitted = uv;
  if (outputAspect > frameAspect) {
    fitted.y = (uv.y - 0.5) * (outputAspect / frameAspect) + 0.5;
  } else {
    fitted.x = (uv.x - 0.5) * (frameAspect / outputAspect) + 0.5;
  }
  // The hand coordinates are mirrored for a natural self-facing canvas.
  return vec2f(1.0 - fitted.x, fitted.y);
}

fn camera_sample(uv: vec2f, resolution: vec2f) -> vec3f {
  let frameSize = vec2f(textureDimensions(frameTexture));
  let texel = 1.0 / max(frameSize, vec2f(1.0));
  let point = camera_uv(uv, resolution);
  // Match the reference demo's frosted pre-writing surface: the person and
  // hand remain legible as a silhouette without competing with the guide.
  let blur = texel * 7.5;
  let taps = array<vec2f, 9>(
    vec2f(-1.0, -1.0),
    vec2f(0.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 0.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(-1.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
  );
  var color = vec3f(0.0);
  for (var index = 0u; index < 9u; index = index + 1u) {
    let sampleUv = clamp(point + taps[index] * blur, vec2f(0.0), vec2f(1.0));
    color += textureSample(frameTexture, frameSampler, sampleUv).rgb;
  }
  return color / 9.0;
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / uniforms.resolution;
  let coverage = clamp(mask_at(uv), 0.0, 1.0);

  let edge_distance = distance(uv, vec2f(0.5));
  let paper_shadow = smoothstep(0.24, 0.78, edge_distance) * 0.018;
  let paper_grain = grain(position.xy) * 0.008;
  let paper = vec3f(0.976, 0.959, 0.925) - vec3f(paper_shadow) + vec3f(paper_grain);

  var base = paper;
  if (uniforms.show_camera > 0.5) {
    let camera = camera_sample(uv, uniforms.resolution);
    // Keep the person recognisable while making the image feel like a soft
    // private window behind the crisp-edged translucent reference.
    let softened = mix(camera, vec3f(0.976, 0.959, 0.925), 0.10);
    base = softened * vec3f(1.025, 1.0, 0.975) + vec3f(paper_grain);
  }

  let ink_grain = grain(position.xy * 0.67) * 0.026;
  let ink_pool = smoothstep(0.30, 0.96, coverage);
  let wet_ink = vec3f(0.074, 0.061, 0.053) +
    vec3f(ink_grain, ink_grain * 0.68, ink_grain * 0.52) -
    vec3f(ink_pool * 0.012);
  let ink = mix(base, wet_ink, smoothstep(0.035, 0.88, coverage));
  var color = ink;

  if (uniforms.show_cursor > 0.5) {
    for (var i = 0u; i < BRUSH_COUNT; i = i + 1u) {
      let brush = brushes[i];
      if (brush.tracking < 0.5) {
        continue;
      }
      color = composite_brush(color, uv * uniforms.mask_size, brush);
    }
  }

  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
