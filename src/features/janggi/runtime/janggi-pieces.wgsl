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

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) objectPosition: vec3f,
  @location(3) side: f32,
  @location(4) selected: f32,
  @location(5) part: f32,
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

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
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
  let pickup = smoothstep(0.0, 0.16, params.moveProgress);
  let landing = 1.0 - smoothstep(0.82, 1.0, params.moveProgress);
  let carried = moving * min(pickup, landing);
  radius *= 1.0 + chosen * 0.075 + carried * 0.12;
  let lift = chosen * (0.105 + sin(params.time * 3.2) * 0.022) + carried * 0.62;
  var center = pieceWorldXZ(data.xy);
  center += vec2f(
    -sin(params.moveProgress * 3.14159265) * 0.105,
    sin(params.moveProgress * 3.14159265) * 0.055,
  ) * carried;
  var world = vec3f(0.0);
  var worldNormal = vec3f(0.0, 1.0, 0.0);
  if (params.part < 0.5) {
    world = vec3f(
      center.x + position.x * radius,
      0.12 + height * 0.5 + lift + position.y * height - (1.0 - data.w) * 30.0,
      center.y + position.z * radius,
    );
    worldNormal = normalize(vec3f(
      normal.x / radius,
      normal.y / height,
      normal.z / radius,
    ));
  } else {
    world = vec3f(
      center.x + position.x * radius,
      0.12 + height + lift + position.y * radius * 0.72 - (1.0 - data.w) * 30.0,
      center.y + position.z * radius,
    );
    worldNormal = normalize(vec3f(
      normal.x / radius,
      normal.y / (radius * 0.72),
      normal.z / radius,
    ));
  }
  var out: VertexOut;
  out.position = params.viewProjection * vec4f(world, 1.0);
  out.worldPosition = world;
  out.worldNormal = worldNormal;
  out.objectPosition = position;
  out.side = data.z;
  out.selected = max(chosen, moving);
  out.part = params.part;
  return out;
}

fn hash3(position: vec3f) -> f32 {
  return fract(sin(dot(position, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
}

fn jadeCloud(position: vec3f) -> f32 {
  let broad = sin(position.x * 7.2 + position.z * 5.4 + sin(position.y * 8.0) * 1.7);
  let fine = sin(position.x * 19.0 - position.z * 13.0 + position.y * 11.0);
  let grain = hash3(floor(position * 42.0)) * 2.0 - 1.0;
  return broad * 0.52 + fine * 0.22 + grain * 0.26;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let normal = normalize(in.worldNormal);
  let view = normalize(vec3f(0.0, 7.4, 6.8) - in.worldPosition);
  let lightDirection = normalize(vec3f(-0.42, 0.86, 0.31));
  let halfVector = normalize(view + lightDirection);
  let top = smoothstep(0.74, 0.985, normal.y);
  let radial = length(in.objectPosition.xz);
  let darkJade = vec3f(0.035, 0.19, 0.135);
  let darkJadeLight = vec3f(0.16, 0.49, 0.35);
  let celadonJade = vec3f(0.28, 0.52, 0.37);
  let celadonJadeLight = vec3f(0.68, 0.84, 0.59);
  let jadeBase = mix(darkJade, celadonJade, in.side);
  let jadeLight = mix(darkJadeLight, celadonJadeLight, in.side);
  let cloud = jadeCloud(in.objectPosition + vec3f(in.side * 2.7));
  let stoneLine = pow(max(1.0 - abs(sin(
    in.objectPosition.x * 8.4 +
    in.objectPosition.z * 5.7 +
    in.objectPosition.y * 4.1 +
    cloud * 2.2
  )), 0.0), 9.0);
  var material = mix(jadeBase, jadeLight, 0.30 + cloud * 0.18 + top * 0.11);
  material = mix(material, jadeLight * 1.08, stoneLine * 0.31);

  let facing = max(dot(normal, view), 0.0);
  let fresnel = pow(1.0 - facing, 3.2);
  let diffuse = clamp(dot(normal, lightDirection) * 0.62 + 0.38, 0.0, 1.0);
  let backScatter = pow(max(dot(-normal, lightDirection), 0.0), 1.6) * 0.32;
  let innerGlow = pow(1.0 - abs(dot(normal, lightDirection)), 2.0) * 0.17;
  let specular = pow(max(dot(normal, halfVector), 0.0), 104.0) * 0.88;
  let broadSpecular = pow(max(dot(normal, halfVector), 0.0), 18.0) * 0.16;
  let ringAccent = select(0.0, 1.0, in.part > 0.5);
  let antiqueGold = vec3f(0.68, 0.43, 0.14);
  let goldHighlight = vec3f(1.0, 0.82, 0.42);
  material = mix(material, antiqueGold, ringAccent);

  var color = material * (0.4 + diffuse * 0.58) +
    jadeLight * (backScatter + innerGlow) +
    mix(vec3f(0.48, 0.88, 0.66), vec3f(0.79, 0.95, 0.72), in.side) * fresnel * 0.38 +
    vec3f(1.0, 0.96, 0.84) * (specular + broadSpecular);
  color = mix(
    color,
    antiqueGold * (0.64 + diffuse * 0.32) + goldHighlight * (specular * 1.35 + fresnel * 0.24),
    ringAccent,
  );
  color = mix(color, color * 1.13 + jadeLight * 0.12, in.selected * 0.62);
  let jadeAlpha = mix(0.88, 0.82, in.side) + fresnel * 0.055;
  let alpha = mix(min(jadeAlpha, 0.94), 1.0, ringAccent);
  return vec4f(color * alpha, alpha);
}
