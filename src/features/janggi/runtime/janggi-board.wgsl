struct Params {
  viewProjection: mat4x4f,
  time: f32,
  moveState: f32,
  moveProgress: f32,
  movePieceIndex: f32,
  moveFromCol: f32,
  moveFromRow: f32,
  moveToCol: f32,
  moveToRow: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> pieceStates: array<vec4f, 32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) localPosition: vec3f,
}

fn boardWorld(position: vec3f) -> vec3f {
  return vec3f(position.x * 5.6, position.y * 0.24, position.z * 6.35);
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VertexOut {
  let world = boardWorld(position);
  var out: VertexOut;
  out.position = params.viewProjection * vec4f(world, 1.0);
  out.worldPosition = world;
  out.worldNormal = normalize(vec3f(
    normal.x / 5.6,
    normal.y / 0.24,
    normal.z / 6.35,
  ));
  out.localPosition = position;
  return out;
}

fn hash2(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise2(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let smoothLocal = local * local * (vec2f(3.0) - 2.0 * local);
  let a = hash2(cell);
  let b = hash2(cell + vec2f(1.0, 0.0));
  let c = hash2(cell + vec2f(0.0, 1.0));
  let d = hash2(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, smoothLocal.x), mix(c, d, smoothLocal.x), smoothLocal.y);
}

fn pieceGrid(index: u32) -> vec4f {
  var data = pieceStates[index];
  let movingIndex = u32(max(params.movePieceIndex, 0.0));
  if (params.movePieceIndex >= 0.0 && index == movingIndex && params.moveState > 1.5) {
    let travel = smoothstep(0.16, 0.82, params.moveProgress);
    data.x = mix(params.moveFromCol, params.moveToCol, travel);
    data.y = mix(params.moveFromRow, params.moveToRow, travel);
  }
  return data;
}

fn pieceWorldXZ(grid: vec2f) -> vec2f {
  return vec2f((grid.x - 4.0) * 0.58, (grid.y - 4.5) * 0.61);
}

fn gridStroke(value: f32, segments: f32) -> f32 {
  let wrapped = fract(value * segments);
  let distance = min(wrapped, 1.0 - wrapped);
  return 1.0 - smoothstep(0.0, 0.027, distance);
}

fn diagonalStroke(point: vec2f) -> f32 {
  let first = 1.0 - smoothstep(0.0, 0.035, abs(point.x - point.y));
  let second = 1.0 - smoothstep(0.0, 0.035, abs(point.x - (1.0 - point.y)));
  return max(first, second);
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let normal = normalize(in.worldNormal);
  let view = normalize(vec3f(0.0, 7.4, 6.8) - in.worldPosition);
  let lightDirection = normalize(vec3f(-0.42, 0.86, 0.31));
  let halfVector = normalize(view + lightDirection);
  let top = smoothstep(0.72, 0.98, normal.y);

  let grainPoint = vec2f(
    in.worldPosition.x * 0.46 + in.worldPosition.z * 0.08,
    in.worldPosition.z * 2.4,
  );
  let wideGrain = noise2(grainPoint * vec2f(1.0, 0.42));
  let fineGrain = noise2(grainPoint * vec2f(3.7, 1.45) + vec2f(5.3, -1.7));
  let grain = wideGrain * 0.68 + fineGrain * 0.32;
  let walnutShadow = vec3f(0.075, 0.033, 0.018);
  let walnutLight = vec3f(0.47, 0.235, 0.105);
  let broadFlow = sin(
    in.worldPosition.x * 1.18 +
    sin(in.worldPosition.z * 0.82) * 2.35 +
    wideGrain * 3.1
  );
  let fineFlow = sin(
    in.worldPosition.x * 2.75 -
    in.worldPosition.z * 1.12 +
    fineGrain * 4.8
  );
  let paleVein = pow(max(1.0 - abs(broadFlow), 0.0), 13.0);
  let smokeVein = pow(max(1.0 - abs(fineFlow), 0.0), 18.0);
  var wood = mix(walnutShadow, walnutLight, 0.24 + grain * 0.45);
  wood = mix(wood, vec3f(0.73, 0.41, 0.18), paleVein * 0.24);
  wood = mix(wood, vec3f(0.025, 0.014, 0.01), smokeVein * 0.15);

  if (top > 0.5) {
    let uv = vec2f(
      (in.localPosition.x + 0.42) / 0.84,
      (in.localPosition.z + 0.44) / 0.88,
    );
    let inside = select(0.0, 1.0, all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)));
    let grid = max(gridStroke(uv.x, 8.0), gridStroke(uv.y, 9.0)) * inside;

    let edgeDistance = min(
      0.5 - abs(in.localPosition.x),
      0.5 - abs(in.localPosition.z),
    );
    let topLip = 1.0 - smoothstep(0.012, 0.072, edgeDistance);
    let perimeterInlay = 1.0 - smoothstep(
      0.004,
      0.014,
      abs(edgeDistance - 0.073),
    );
    wood = mix(wood, vec3f(0.025, 0.015, 0.011), topLip * 0.48);
    wood = mix(wood, vec3f(0.83, 0.58, 0.28), perimeterInlay * 0.32);

    var palace = 0.0;
    let upper = vec2f((uv.x - 0.375) / 0.25, uv.y / (2.0 / 9.0));
    if (all(upper >= vec2f(0.0)) && all(upper <= vec2f(1.0))) {
      palace = max(palace, diagonalStroke(upper));
    }
    let lower = vec2f((uv.x - 0.375) / 0.25, (uv.y - 7.0 / 9.0) / (2.0 / 9.0));
    if (all(lower >= vec2f(0.0)) && all(lower <= vec2f(1.0))) {
      palace = max(palace, diagonalStroke(lower));
    }

    let ink = max(grid, palace) * 0.78;
    wood = mix(wood, vec3f(0.84, 0.64, 0.34), ink * 0.82);

    var contactShadow = 0.0;
    for (var index = 0u; index < 32u; index += 1u) {
      let piece = pieceGrid(index);
      if (piece.w < 0.5) {
        continue;
      }
      let center = pieceWorldXZ(piece.xy);
      let contactDelta = in.worldPosition.xz - center;
      let castDelta = in.worldPosition.xz - (center + vec2f(0.085, 0.065));
      let contact = exp(-dot(contactDelta, contactDelta) * 48.0);
      let castShadow = exp(-dot(castDelta, castDelta) * 17.0) * 0.44;
      contactShadow = max(contactShadow, max(contact, castShadow));
    }
    wood *= 1.0 - contactShadow * 0.27;

    if (params.moveState > 0.5 && params.moveState < 1.5) {
      let targetDelta = in.worldPosition.xz - pieceWorldXZ(vec2f(params.moveToCol, params.moveToRow));
      let targetDistance = length(targetDelta);
      let targetRing = 1.0 - smoothstep(0.026, 0.062, abs(targetDistance - 0.31));
      let pulse = 0.72 + sin(params.time * 3.2) * 0.2;
      wood = mix(wood, vec3f(0.95, 0.64, 0.22), targetRing * pulse * 0.82);
    }
  } else {
    let sideBand = 0.94 + sin(in.worldPosition.z * 9.0) * 0.035;
    wood = mix(
      vec3f(0.035, 0.018, 0.012),
      vec3f(0.25, 0.115, 0.055),
      grain,
    ) * sideBand;
  }

  let diffuse = max(dot(normal, lightDirection), 0.0);
  let wrapped = clamp(diffuse * 0.72 + 0.28, 0.0, 1.0);
  let specular = pow(max(dot(normal, halfVector), 0.0), 88.0) * 0.38;
  let rim = pow(1.0 - max(dot(normal, view), 0.0), 3.0) * 0.08;
  let color = wood * (0.48 + wrapped * 0.72) +
    vec3f(1.0, 0.76, 0.42) * specular +
    vec3f(0.35, 0.17, 0.08) * rim;
  return vec4f(color, 1.0);
}
