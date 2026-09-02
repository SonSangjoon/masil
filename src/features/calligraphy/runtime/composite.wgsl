// MASIL adaptation of vGPU Air Painting's persistent mask compositor.
// The camera is used only for local hand tracking; it is never drawn.

struct Uniforms {
  resolution: vec2f,
  mask_size: vec2f,
  show_cursor: f32,
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
};

const BRUSH_COUNT: u32 = 2u;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> mask: array<f32>;
@group(0) @binding(2) var<storage, read> brushes: array<BrushState, 2>;

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

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / uniforms.resolution;
  let coverage = clamp(mask_at(uv), 0.0, 1.0);

  let edge_distance = distance(uv, vec2f(0.5));
  let paper_shadow = smoothstep(0.24, 0.78, edge_distance) * 0.018;
  let paper_grain = grain(position.xy) * 0.008;
  let paper = vec3f(0.976, 0.959, 0.925) - vec3f(paper_shadow) + vec3f(paper_grain);

  let ink_grain = grain(position.xy * 0.67) * 0.035;
  let wet_ink = vec3f(0.095, 0.078, 0.067) + vec3f(ink_grain, ink_grain * 0.7, ink_grain * 0.55);
  let ink = mix(paper, wet_ink, smoothstep(0.04, 0.92, coverage));
  var color = ink;

  if (uniforms.show_cursor > 0.5) {
    for (var i = 0u; i < BRUSH_COUNT; i = i + 1u) {
      let brush = brushes[i];
      if (brush.tracking < 0.5) {
        continue;
      }
      let d = distance(uv * uniforms.mask_size, brush.current * uniforms.mask_size);
      let ring = smoothstep(uniforms.cursor_radius + 2.0, uniforms.cursor_radius + 0.5, d) *
                 smoothstep(uniforms.cursor_radius - 2.0, uniforms.cursor_radius - 0.5, d);
      color = mix(color, vec3f(0.70, 0.31, 0.22), ring * 0.72);
    }
  }

  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
