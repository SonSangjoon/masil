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
  part: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> pieceStates: array<vec4f, 32>;
@group(0) @binding(2) var glyphAtlas: texture_2d<f32>;
@group(0) @binding(3) var glyphSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) objectPosition: vec3f,
  @location(3) side: f32,
  @location(4) selected: f32,
  @location(5) part: f32,
  @location(6) opacity: f32,
  @location(7) ejected: f32,
  @location(8) glyphUv: vec2f,
  @location(9) @interpolate(flat) pieceIndex: u32,
  @location(10) @interpolate(flat) faceTop: f32,
}

fn pieceGrid(index: u32) -> vec4f {
  var data = pieceStates[index];
  let movingIndex = u32(max(params.movePieceIndex, 0.0));
  if (params.movePieceIndex >= 0.0 && index == movingIndex && params.moveState > 1.5) {
    let travel = smoothstep(0.14, 0.72, params.moveProgress);
    data.x = mix(params.moveFromCol, params.moveToCol, travel);
    data.y = mix(params.moveFromRow, params.moveToRow, travel);
  }
  return data;
}

fn pieceWorldXZ(grid: vec2f) -> vec2f {
  return vec2f((grid.x - 4.0) * 0.58, (grid.y - 4.5) * 0.61);
}

fn captureDirection() -> vec2f {
  let directionKey = i32(params.movePieceIndex) * 5 +
    i32(params.moveToCol) * 3 +
    i32(params.moveToRow) * 7;
  let directionStep = ((directionKey % 16) + 16) % 16;
  let angle = (f32(directionStep) + 0.5) / 16.0 * 6.2831853;
  return vec2f(cos(angle), sin(angle));
}

fn captureSpin() -> f32 {
  let directionKey = i32(params.movePieceIndex) * 5 +
    i32(params.moveToCol) * 3 +
    i32(params.moveToRow) * 7;
  let directionStep = ((directionKey % 16) + 16) % 16;
  let spinKey = i32(params.movePieceIndex) * 11 +
    i32(params.moveToCol) * 7 +
    i32(params.moveToRow) * 5;
  let spinStep = ((spinKey % 7) + 7) % 7;
  let spinDirection = select(1.0, -1.0, directionStep % 2 == 0);
  return spinDirection * (10.5 + f32(spinStep));
}

fn rotateAroundAxis(value: vec3f, axis: vec3f, angle: f32) -> vec3f {
  let sine = sin(angle);
  let cosine = cos(angle);
  return value * cosine +
    cross(axis, value) * sine +
    axis * dot(axis, value) * (1.0 - cosine);
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  let data = pieceGrid(instance);
  let movingIndex = u32(max(params.movePieceIndex, 0.0));
  let king = select(0.0, 1.0, instance == 4u || instance == 27u);
  let soldier = select(0.0, 1.0, instance >= 11u && instance <= 20u);
  let guard = select(
    0.0,
    1.0,
    instance == 3u || instance == 5u || instance == 26u || instance == 28u,
  );
  let chosen = select(
    0.0,
    1.0,
    params.movePieceIndex >= 0.0 && instance == movingIndex && params.moveState > 0.5 && params.moveState < 1.5,
  );
  let moving = select(
    0.0,
    1.0,
    params.movePieceIndex >= 0.0 && instance == movingIndex && params.moveState > 1.5 && params.moveProgress < 0.999,
  );
  let captured = select(
    0.0,
    1.0,
    data.w > 1.5 && params.moveState > 1.5,
  );
  var radius = 0.27;
  var height = 0.17;
  if (soldier > 0.5 || guard > 0.5) {
    radius = 0.235;
    height = 0.148;
  }
  if (king > 0.5) {
    radius = 0.325;
    height = 0.21;
  }
  let travel = smoothstep(0.14, 0.72, params.moveProgress);
  let pickup = smoothstep(0.0, 0.14, params.moveProgress);
  let landing = 1.0 - smoothstep(0.58, 0.72, params.moveProgress);
  let carried = moving * min(pickup, landing);
  radius *= 1.0 + chosen * 0.075 + carried * 0.12;
  let captureProgress = clamp((params.moveProgress - 0.72) / 0.28, 0.0, 1.0);
  let captureDistance = captureProgress * 3.15 + captureProgress * captureProgress * 0.55;
  let captureArc = 1.25 * 4.0 * captureProgress * (1.0 - captureProgress);
  let captureOpacity = 1.0 - smoothstep(0.64, 1.0, captureProgress);
  let lift = chosen * (0.105 + sin(params.time * 3.2) * 0.022) +
    carried * 0.62 +
    captured * captureArc;
  var center = pieceWorldXZ(data.xy);
  center += vec2f(
    -sin(travel * 3.14159265) * 0.105,
    sin(travel * 3.14159265) * 0.055,
  ) * carried;
  let impulseDirection = captureDirection();
  center += impulseDirection * captureDistance * captured;

  var localPosition = vec3f(0.0);
  var localNormal = vec3f(0.0, 1.0, 0.0);
  if (params.part < 0.5) {
    localPosition = vec3f(
      position.x * radius,
      position.y * height,
      position.z * radius,
    );
    localNormal = normalize(vec3f(
      normal.x / radius,
      normal.y / height,
      normal.z / radius,
    ));
  } else {
    localPosition = vec3f(
      position.x * radius,
      height * 0.5 + position.y * radius * 0.72,
      position.z * radius,
    );
    localNormal = normalize(vec3f(
      normal.x / radius,
      normal.y / (radius * 0.72),
      normal.z / radius,
    ));
  }
  let tumbleAxis = vec3f(impulseDirection.y, 0.0, -impulseDirection.x);
  let tumbleAngle = captured * captureSpin() * captureProgress;
  localPosition = rotateAroundAxis(localPosition, tumbleAxis, tumbleAngle);
  let worldNormal = normalize(rotateAroundAxis(localNormal, tumbleAxis, tumbleAngle));
  let visible = clamp(max(data.w, captured), 0.0, 1.0);
  let world = vec3f(
    center.x,
    0.12 + height * 0.5 + lift - (1.0 - visible) * 30.0,
    center.y,
  ) + localPosition;
  var out: VertexOut;
  out.position = params.viewProjection * vec4f(world, 1.0);
  out.worldPosition = world;
  out.worldNormal = worldNormal;
  out.objectPosition = position;
  out.side = data.z;
  let impactFlash = captured * (1.0 - smoothstep(0.0, 0.16, captureProgress));
  out.selected = max(max(chosen, moving), impactFlash);
  out.part = params.part;
  out.opacity = mix(1.0, captureOpacity, captured);
  out.ejected = captured;
  // Cylinder cap UVs are flipped along the board's depth axis so glyphs read
  // upright from the player's side. Because these values travel through the
  // same vertex path, the glyph tumbles and fades with the captured piece.
  out.glyphUv = vec2f(uv.x, 1.0 - uv.y);
  out.pieceIndex = instance;
  out.faceTop = select(
    0.0,
    1.0,
    params.part < 0.5 && normal.y > 0.9,
  );
  return out;
}

fn hash3(position: vec3f) -> f32 {
  return fract(sin(dot(position, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
}

fn jadeCloud(position: vec3f) -> f32 {
  let broad = sin(position.x * 6.1 + position.z * 4.7 + sin(position.y * 6.8) * 1.25);
  let fine = sin(position.x * 15.0 - position.z * 10.5 + position.y * 8.4);
  let grain = hash3(floor(position * 31.0)) * 2.0 - 1.0;
  return broad * 0.58 + fine * 0.18 + grain * 0.12;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let normal = normalize(in.worldNormal);
  let view = normalize(vec3f(0.0, 7.4, 6.8) - in.worldPosition);
  let keyLight = normalize(vec3f(-0.46, 0.82, 0.34));
  let fillLight = normalize(vec3f(0.66, 0.42, -0.46));
  let halfVector = normalize(view + keyLight);
  let top = smoothstep(0.74, 0.985, normal.y);
  let radial = length(in.objectPosition.xz);
  // Han is cool blue-green jade. Cho is pale, warm celadon. Both bodies stay
  // translucent, with enough body density to separate cleanly from pale wood.
  let hanJade = vec3f(0.13, 0.52, 0.53);
  let hanJadeLight = vec3f(0.76, 0.97, 0.94);
  let choJade = vec3f(0.65, 0.79, 0.61);
  let choJadeLight = vec3f(0.98, 0.995, 0.88);
  let jadeBase = mix(hanJade, choJade, in.side);
  let jadeLight = mix(hanJadeLight, choJadeLight, in.side);
  let cloud = jadeCloud(in.objectPosition + vec3f(in.side * 2.7));
  let innerVein = pow(max(1.0 - abs(sin(
    in.objectPosition.x * 7.1 +
    in.objectPosition.z * 4.8 +
    in.objectPosition.y * 3.6 +
    cloud * 1.8
  )), 0.0), 13.0);
  let centerGlow = 1.0 - smoothstep(0.12, 1.04, radial);
  var material = mix(jadeBase, jadeLight, 0.46 + cloud * 0.065 + top * 0.07);
  material = mix(material, jadeLight * 1.04, innerVein * 0.12 + centerGlow * 0.08);

  let facing = max(dot(normal, view), 0.0);
  let fresnel = pow(1.0 - facing, 2.55);
  let diffuse = clamp(dot(normal, keyLight) * 0.58 + 0.42, 0.0, 1.0);
  let fill = max(dot(normal, fillLight), 0.0) * 0.16;
  let backScatter = pow(max(dot(-normal, keyLight), 0.0), 1.5) * 0.38;
  let subsurface = pow(1.0 - abs(dot(normal, keyLight)), 2.2) * 0.19;
  let specular = pow(max(dot(normal, halfVector), 0.0), 132.0) * 1.05;
  let broadSpecular = pow(max(dot(normal, halfVector), 0.0), 22.0) * 0.17;
  let ringAccent = select(0.0, 1.0, in.part > 0.5);
  let hanRim = vec3f(0.035, 0.27, 0.38);
  let choRim = vec3f(0.65, 0.20, 0.12);
  let sideRim = mix(hanRim, choRim, in.side);

  var color = material * (0.34 + diffuse * 0.38 + fill) +
    jadeLight * (backScatter + subsurface) +
    jadeLight * fresnel * 0.52 +
    vec3f(1.0, 0.985, 0.93) * (specular + broadSpecular);
  color = mix(
    color,
    sideRim * (0.72 + diffuse * 0.24) + vec3f(1.0, 0.96, 0.9) * (specular * 1.2 + fresnel * 0.2),
    ringAccent,
  );
  color = mix(color, color * 1.08 + jadeLight * 0.1, in.selected * 0.58);
  color = mix(color, color * 1.16 + jadeLight * 0.12, in.ejected * 0.72);

  // Eight columns by four rows, one fixed atlas cell per piece index. A small
  // inset prevents linear filtering from reaching a neighbouring glyph.
  let atlasGrid = vec2f(8.0, 4.0);
  let atlasCell = vec2f(
    f32(in.pieceIndex % 8u),
    f32(in.pieceIndex / 8u),
  );
  let glyphCellUv = mix(
    vec2f(0.075),
    vec2f(0.925),
    clamp(in.glyphUv, vec2f(0.0), vec2f(1.0)),
  );
  let glyphUv = (atlasCell + glyphCellUv) / atlasGrid;
  let atlasTexel = 1.0 / vec2f(textureDimensions(glyphAtlas));
  let glyphMask = textureSample(glyphAtlas, glyphSampler, glyphUv).a * in.faceTop;
  let glyphInset = textureSample(
    glyphAtlas,
    glyphSampler,
    glyphUv + atlasTexel * vec2f(1.35, 1.65),
  ).a * in.faceTop;
  let glyphHighlight = max(glyphInset - glyphMask, 0.0);
  let glyphCoverage = smoothstep(0.06, 0.76, glyphMask);
  let hanInk = vec3f(0.018, 0.13, 0.18);
  let choInk = vec3f(0.43, 0.07, 0.035);
  let glyphInk = mix(hanInk, choInk, in.side);
  color = mix(
    color,
    glyphInk * (0.82 + diffuse * 0.18),
    glyphCoverage * 0.96,
  );
  color += jadeLight * glyphHighlight * 0.15;

  let bodyAlpha = mix(0.35, 0.39, in.side) +
    fresnel * 0.19 +
    innerVein * 0.02 +
    in.ejected * 0.20;
  let rimAlpha = 0.66 + fresnel * 0.18 + in.ejected * 0.14;
  let materialAlpha = clamp(mix(bodyAlpha, rimAlpha, ringAccent), 0.0, 0.96);
  let alpha = max(materialAlpha, glyphCoverage * 0.89) * in.opacity;
  return vec4f(color * alpha, alpha);
}
