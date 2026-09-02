struct TransitionParams {
  resolution: vec2f,
  time: f32,
  progress: f32,
  activity: f32,
}

@group(0) @binding(0) var<uniform> params: TransitionParams;

struct VertexOut {
  @builtin(position) position: vec4f,
}

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> VertexOut {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var out: VertexOut;
  out.position = vec4f(positions[index], 0.0, 1.0);
  return out;
}

fn hash21(point: vec2f) -> f32 {
  let value = dot(point, vec2f(127.1, 311.7));
  return fract(sin(value) * 43758.5453123);
}

fn valueNoise(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let smoothLocal = local * local * (vec2f(3.0) - 2.0 * local);
  let a = hash21(cell);
  let b = hash21(cell + vec2f(1.0, 0.0));
  let c = hash21(cell + vec2f(0.0, 1.0));
  let d = hash21(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, smoothLocal.x), mix(c, d, smoothLocal.x), smoothLocal.y);
}

fn fbm(point: vec2f) -> f32 {
  var p = point;
  var amplitude = 0.52;
  var sum = 0.0;
  for (var index = 0; index < 4; index += 1) {
    sum += valueNoise(p) * amplitude;
    p = mat2x2f(1.72, -1.13, 1.13, 1.72) * p + vec2f(2.9, -1.7);
    amplitude *= 0.48;
  }
  return sum;
}

fn lineMask(value: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width, width * 2.35, abs(value));
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1.0));
  let uv = in.position.xy / resolution;
  let aspect = resolution.x / resolution.y;
  let origin = vec2f(0.5, 0.225);
  var point = uv - origin;
  point.x *= aspect;

  let progress = clamp(params.progress, 0.0, 1.0);
  let charge = smoothstep(0.0, 0.24, progress);
  let bloom = smoothstep(0.20, 0.62, progress);
  let reveal = smoothstep(0.57, 1.0, progress);
  let life = params.time;

  let angle = atan2(point.y, point.x);
  let baseDistance = length(point);
  let turbulence = fbm(point * 4.8 + vec2f(life * 0.09, -life * 0.055));
  let directionalWave =
    sin(angle * 7.0 - life * 1.45) * 0.012 * charge +
    sin(angle * 13.0 + life * 0.82) * 0.006 * charge;

  // The landing orb first inhales, then its GPU surface becomes the scene wipe.
  let inhale = sin(charge * 3.14159265) * 0.018;
  let startRadius = 0.084 - inhale;
  let coverRadius = mix(startRadius, 1.22, pow(bloom, 2.35));
  let organicDistance = baseDistance + (turbulence - 0.5) * mix(0.008, 0.085, bloom) + directionalWave;
  let body = 1.0 - smoothstep(coverRadius - 0.022, coverRadius + 0.025, organicDistance);

  let ringDistance = abs(organicDistance - max(coverRadius, startRadius));
  let pressureRing =
    (1.0 - smoothstep(0.006, 0.027, ringDistance)) *
    smoothstep(0.015, 0.18, progress) *
    (1.0 - smoothstep(0.53, 0.67, progress));

  // A clear aperture opens after the React activity world has been swapped under
  // the fully opaque GPU field. No route cut or cross-fade is exposed.
  var revealPoint = uv - vec2f(0.5, mix(0.15, 0.48, params.activity));
  revealPoint.x *= aspect;
  let revealNoise = fbm(revealPoint * 3.7 - vec2f(life * 0.05, life * 0.025));
  let revealRadius = mix(-0.08, 1.72, reveal * reveal * (3.0 - 2.0 * reveal));
  let revealAngle = atan2(revealPoint.y, revealPoint.x);
  let apertureLobes =
    sin(revealAngle * 3.0 - life * 0.34) * 0.052 +
    sin(revealAngle * 7.0 + life * 0.21) * 0.021;
  let apertureDistance = length(revealPoint) +
    apertureLobes * (1.0 - reveal * 0.54) +
    (revealNoise - 0.5) * 0.10 * (1.0 - reveal * 0.42);
  let outsideAperture = smoothstep(revealRadius - 0.035, revealRadius + 0.038, apertureDistance);

  let bodyArrival = smoothstep(0.095, 0.24, progress);
  var alpha = body * outsideAperture * bodyArrival;

  // GPU filaments make the transition respond as a living field rather than a
  // flat radial wipe. Their paths differ subtly for calligraphy and janggi.
  let streamPoint = point * mat2x2f(cos(life * 0.08), -sin(life * 0.08), sin(life * 0.08), cos(life * 0.08));
  let calligraphyFlow =
    sin(streamPoint.x * 11.0 + streamPoint.y * 3.1 - life * 1.15) * 0.46 +
    sin(streamPoint.y * 15.0 - streamPoint.x * 2.4 + life * 0.74) * 0.23;
  let janggiFlow = max(
    lineMask(fract((uv.x + life * 0.014) * 8.0) - 0.5, 0.025),
    lineMask(fract((uv.y - life * 0.010) * 9.0) - 0.5, 0.025),
  );
  let activityFlow = mix(
    lineMask(calligraphyFlow, 0.012),
    janggiFlow,
    step(0.5, params.activity),
  );
  let flowWindow = smoothstep(0.11, 0.29, progress) * (1.0 - smoothstep(0.72, 0.96, progress));
  let frontBand = 1.0 - smoothstep(0.018, 0.19, ringDistance);
  let flowAlpha = activityFlow * frontBand * flowWindow * (0.018 + bloom * 0.075) * outsideAperture;

  let cell = floor((uv + vec2f(life * 0.012, -life * 0.008)) * vec2f(29.0, 23.0));
  let cellLocal = fract((uv + vec2f(life * 0.012, -life * 0.008)) * vec2f(29.0, 23.0)) - 0.5;
  let particleSeed = hash21(cell);
  let particle = (1.0 - smoothstep(
    0.018,
    0.09,
    length(cellLocal - vec2f(particleSeed - 0.5, fract(particleSeed * 7.13) - 0.5) * 0.52),
  )) * step(0.79, particleSeed);
  let particleBand = 1.0 - smoothstep(0.045, 0.24, ringDistance);
  let particleAlpha = particle * particleBand * flowWindow * 0.15;

  let deepTerracotta = vec3f(0.43, 0.145, 0.09);
  let terracotta = vec3f(0.714, 0.373, 0.286);
  let litClay = vec3f(0.98, 0.72, 0.59);
  let paperLight = vec3f(1.0, 0.965, 0.92);
  let edgeLight = 1.0 - smoothstep(0.01, 0.18, ringDistance);
  let radialDepth = smoothstep(0.08, max(coverRadius, 0.09), baseDistance);
  var color = mix(deepTerracotta, terracotta, smoothstep(0.16, 0.82, turbulence));
  color = mix(color, terracotta * 1.08, radialDepth * 0.22);
  color = mix(color, litClay, edgeLight * 0.24);
  color = mix(color, litClay, pressureRing * 0.72 + flowAlpha * 1.8);
  color = mix(color, paperLight, particleAlpha * 1.4);

  alpha = clamp(max(alpha, pressureRing * 0.82 + flowAlpha + particleAlpha), 0.0, 1.0);
  return vec4f(color * alpha, alpha);
}
