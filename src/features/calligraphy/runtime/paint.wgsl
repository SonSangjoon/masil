// Stamps both brushes into a persistent 960x540 coverage mask. One invocation
// owns each texel, so max accumulation needs no atomics or CPU brush readback.

struct Uniforms {
  mask_size: vec2f,
  radius: f32,
  feather: f32,
  decay: f32,
  clear_epsilon: f32,
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

// Binding array lengths must be literals for vgpu reflection.
const BRUSH_COUNT: u32 = 2u;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> brushes: array<BrushState, 2>;
@group(0) @binding(2) var<storage, read_write> mask: array<f32>;

fn ink_noise(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn capsule_coverage(texel: vec2f, brush: BrushState) -> f32 {
  let a = brush.prev * uniforms.mask_size;
  let b = brush.current * uniforms.mask_size;
  let ab = b - a;
  let t = clamp(dot(texel - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  let d = distance(texel, a + ab * t);
  let segment_length = length(ab);
  var axis = vec2f(1.0, 0.0);
  if (segment_length > 1e-4) {
    axis = ab / segment_length;
  }
  let normal = vec2f(-axis.y, axis.x);
  let along = dot(texel, axis);
  let across = dot(texel, normal);
  let current_radius = select(uniforms.radius, brush.radius, brush.radius > 0.0);
  let previous_radius = select(
    current_radius,
    brush.prev_radius,
    brush.prev_radius > 0.0
  );
  let radius = mix(previous_radius, current_radius, smoothstep(0.0, 1.0, t));

  // Grain follows the stroke axis, like bundled hairs dragging across paper.
  // Only the outer band breaks apart; the loaded core remains densely inked.
  let strand = ink_noise(vec2f(floor(along * 0.22), floor(across * 1.35)));
  let tooth = (strand - 0.5) * min(2.4, radius * 0.18);
  let silhouette = clamp(
    (radius + tooth - d) / max(uniforms.feather, 1e-3) + 0.5,
    0.0,
    1.0
  );
  let dense_fibre = mix(
    0.96,
    1.0,
    ink_noise(vec2f(floor(along * 0.34), floor(across * 0.78)))
  );
  let broken_edge = mix(0.62, 1.0, strand);
  let edge = smoothstep(radius * 0.58, radius + 1.0, d);
  return silhouette * mix(dense_fibre, broken_edge, edge);
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let width = u32(uniforms.mask_size.x);
  let total = width * u32(uniforms.mask_size.y);
  let index = gid.x;
  if (index >= total) {
    return;
  }

  let texel = vec2f(f32(index % width), f32(index / width)) + vec2f(0.5);
  var coverage = 0.0;
  for (var i = 0u; i < BRUSH_COUNT; i = i + 1u) {
    let brush = brushes[i];
    if (brush.stroke < 0.5) {
      continue;
    }
    coverage = max(coverage, capsule_coverage(texel, brush));
  }

  let previous = mask[index];
  // Snap tiny values to zero below so fully fogged texels can stay idle.
  if (previous <= 0.0 && coverage <= 0.0) {
    return;
  }

  let faded = previous * uniforms.decay;
  var next = max(faded, coverage);
  if (next < uniforms.clear_epsilon) {
    next = 0.0;
  }
  mask[index] = min(next, 1.0);
}
