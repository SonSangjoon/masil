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
  capturedPieceIndex: f32,
  part: f32,
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
  let isBase = params.part > 0.5;
  let width = select(5.6, 5.84, isBase);
  let depth = select(6.35, 6.59, isBase);
  let height = select(0.24, 0.18, isBase);
  let verticalOffset = select(0.0, -0.17, isBase);
  return vec3f(
    position.x * width,
    position.y * height + verticalOffset,
    position.z * depth,
  );
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VertexOut {
  let world = boardWorld(position);
  let isBase = params.part > 0.5;
  let width = select(5.6, 5.84, isBase);
  let depth = select(6.35, 6.59, isBase);
  let height = select(0.24, 0.18, isBase);
  var out: VertexOut;
  out.position = params.viewProjection * vec4f(world, 1.0);
  out.worldPosition = world;
  out.worldNormal = normalize(vec3f(
    normal.x / width,
    normal.y / height,
    normal.z / depth,
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

fn captureDirection() -> vec2f {
  let directionKey = i32(params.movePieceIndex) * 5 +
    i32(params.moveToCol) * 3 +
    i32(params.moveToRow) * 7;
  let directionStep = ((directionKey % 16) + 16) % 16;
  let angle = (f32(directionStep) + 0.5) / 16.0 * 6.2831853;
  return vec2f(cos(angle), sin(angle));
}

fn pieceGrid(index: u32) -> vec4f {
  var data = pieceStates[index];
  let movingIndex = u32(max(params.movePieceIndex, 0.0));
  if (params.movePieceIndex >= 0.0 && index == movingIndex && params.moveState > 1.5) {
    let travel = smoothstep(0.14, 0.72, params.moveProgress);
    data.x = mix(params.moveFromCol, params.moveToCol, travel);
    data.y = mix(params.moveFromRow, params.moveToRow, travel);
  }
  if (data.w > 1.5 && params.moveState > 1.5) {
    let captureProgress = clamp((params.moveProgress - 0.72) / 0.28, 0.0, 1.0);
    let captureDistance = captureProgress * 3.15 + captureProgress * captureProgress * 0.55;
    let impulseDirection = captureDirection();
    data.x += impulseDirection.x * captureDistance / 0.58;
    data.y += impulseDirection.y * captureDistance / 0.61;
    data.w = 1.0 - smoothstep(0.02, 0.34, captureProgress);
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
  let lightDirection = normalize(vec3f(-0.44, 0.84, 0.32));
  let halfVector = normalize(view + lightDirection);
  let top = smoothstep(0.72, 0.98, normal.y);

  // Pale birch / white-oak grain. Broad colour variation stays restrained so
  // the board reads like one carefully finished Nordic furniture panel.
  let macroGrain = noise2(vec2f(
    in.worldPosition.z * 0.44,
    in.worldPosition.x * 0.72,
  ));
  let fineGrain = noise2(vec2f(
    in.worldPosition.z * 1.86 + 7.3,
    in.worldPosition.x * 2.4 - 2.1,
  ));
  let grainFlow = sin(
    in.worldPosition.z * 2.45 +
    macroGrain * 1.45 +
    sin(in.worldPosition.x * 1.1) * 0.34
  );
  let hairlineFlow = sin(
    in.worldPosition.z * 5.1 +
    fineGrain * 2.15 +
    in.worldPosition.x * 0.68
  );
  let darkPore = pow(max(1.0 - abs(grainFlow), 0.0), 28.0);
  let warmFiber = pow(max(1.0 - abs(hairlineFlow), 0.0), 34.0);
  let birchPale = vec3f(0.68, 0.555, 0.41);
  let birchMid = vec3f(0.82, 0.70, 0.54);
  let birchLight = vec3f(0.94, 0.845, 0.70);
  var wood = mix(birchPale, birchMid, 0.58 + macroGrain * 0.10);
  wood = mix(wood, birchLight, fineGrain * 0.075);
  wood = mix(wood, vec3f(0.47, 0.36, 0.24), darkPore * 0.032);
  wood = mix(wood, vec3f(0.98, 0.90, 0.78), warmFiber * 0.022);

  if (top > 0.5 && params.part < 0.5) {
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
    let topLip = 1.0 - smoothstep(0.008, 0.068, edgeDistance);
    let perimeterInlay = 1.0 - smoothstep(
      0.004,
      0.014,
      abs(edgeDistance - 0.073),
    );
    wood = mix(wood, vec3f(0.39, 0.255, 0.145), topLip * 0.21);
    wood = mix(wood, vec3f(0.92, 0.77, 0.54), perimeterInlay * 0.24);

    var palace = 0.0;
    let upper = vec2f((uv.x - 0.375) / 0.25, uv.y / (2.0 / 9.0));
    if (all(upper >= vec2f(0.0)) && all(upper <= vec2f(1.0))) {
      palace = max(palace, diagonalStroke(upper));
    }
    let lower = vec2f((uv.x - 0.375) / 0.25, (uv.y - 7.0 / 9.0) / (2.0 / 9.0));
    if (all(lower >= vec2f(0.0)) && all(lower <= vec2f(1.0))) {
      palace = max(palace, diagonalStroke(lower));
    }

    let ink = max(grid, palace) * 0.82;
    let lineColor = vec3f(0.29, 0.19, 0.115);
    wood = mix(wood, lineColor, ink * 0.64);

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
    wood *= 1.0 - contactShadow * 0.16;

    if (params.moveState > 0.5 && params.moveState < 1.5) {
      let targetDelta = in.worldPosition.xz - pieceWorldXZ(vec2f(params.moveToCol, params.moveToRow));
      let targetDistance = length(targetDelta);
      let targetRing = 1.0 - smoothstep(0.026, 0.062, abs(targetDistance - 0.31));
      let pulse = 0.72 + sin(params.time * 3.2) * 0.2;
      wood = mix(wood, vec3f(0.88, 0.46, 0.27), targetRing * pulse * 0.72);
    }

    if (params.moveState > 1.5 && params.capturedPieceIndex >= 0.0) {
      let didImpact = select(0.0, 1.0, params.moveProgress >= 0.72);
      let impactAge = clamp((params.moveProgress - 0.72) / 0.28, 0.0, 1.0);
      let impactDelta = in.worldPosition.xz - pieceWorldXZ(vec2f(params.moveToCol, params.moveToRow));
      let impactDistance = length(impactDelta);
      let impactRadius = mix(0.12, 0.52, impactAge);
      let impactRing = 1.0 - smoothstep(0.025, 0.075, abs(impactDistance - impactRadius));
      let impactStrength = didImpact * (1.0 - smoothstep(0.0, 0.58, impactAge));
      wood = mix(wood, vec3f(0.91, 0.58, 0.30), impactRing * impactStrength * 0.32);
    }
  } else if (params.part > 0.5) {
    wood = mix(
      vec3f(0.38, 0.29, 0.19),
      vec3f(0.65, 0.52, 0.36),
      0.46 + macroGrain * 0.22,
    );
  } else {
    let sideBand = 0.985 + sin(in.worldPosition.z * 7.0) * 0.012;
    wood = mix(
      vec3f(0.40, 0.31, 0.20),
      vec3f(0.69, 0.56, 0.38),
      0.38 + macroGrain * 0.42,
    ) * sideBand;
  }

  let diffuse = max(dot(normal, lightDirection), 0.0);
  let wrapped = clamp(diffuse * 0.72 + 0.28, 0.0, 1.0);
  let specular = pow(max(dot(normal, halfVector), 0.0), 124.0) * 0.18;
  let broadSheen = pow(max(dot(normal, halfVector), 0.0), 26.0) * 0.038;
  let rim = pow(1.0 - max(dot(normal, view), 0.0), 3.2) * 0.035;
  let color = wood * (0.64 + wrapped * 0.54) +
    vec3f(1.0, 0.94, 0.82) * specular +
    vec3f(0.94, 0.76, 0.52) * broadSheen +
    vec3f(0.43, 0.28, 0.16) * rim;
  return vec4f(color, 1.0);
}
