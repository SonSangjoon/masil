import { presentCeramic } from "./hero-fractal-presentation.wgsl";
import {
  rotateHeroEnvironmentDirection,
  sampleHeroEnvironmentLevel,
} from "./hero-glass-environment.wgsl";

const CERAMIC_F0 = vec3f(0.045);

struct OrbMaterial {
  baseColor: vec3f,
  roughness: f32,
  diffuseStrength: f32,
  specularStrength: f32,
  ambientStrength: f32,
}

struct OrbParams {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec3f,
  time: f32,
  vitality: f32,
  material: OrbMaterial,
  environmentRotation: mat4x4f,
  environmentExposure: f32,
}

@group(0) @binding(0) var<uniform> params: OrbParams;
@group(0) @binding(1) var environmentTexture: texture_2d_array<f32>;
@group(0) @binding(2) var environmentSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) objectPosition: vec3f,
}

fn orbWave(direction: vec3f, time: f32, vitality: f32) -> f32 {
  let amplitude = mix(0.68, 1.0, vitality);
  return (
    sin(dot(direction, vec3f(0.811, 0.324, 0.486)) * 2.05 + time * 0.54) * 0.078 +
    sin(dot(direction, vec3f(-0.365, 0.913, 0.183)) * 2.75 - time * 0.39) * 0.052 +
    sin(dot(direction, vec3f(0.214, -0.456, 0.864)) * 4.4 + time * 0.31) * 0.021 +
    sin(dot(direction, vec3f(-0.704, -0.112, 0.701)) * 7.2 - time * 0.22) * 0.008
  ) * amplitude;
}

fn deformOrb(position: vec3f, time: f32, vitality: f32) -> vec3f {
  let direction = normalize(position);
  let lifeTime = time * mix(0.72, 1.05, vitality);
  let breathing = (
    sin(lifeTime * 0.72) * 0.72 +
    sin(lifeTime * 0.31 + 1.8) * 0.28
  ) * mix(0.028, 0.058, vitality);
  let firstBeat = pow(max(sin(lifeTime * 1.08), 0.0), 16.0);
  let secondBeat = pow(max(sin(lifeTime * 1.08 - 0.65), 0.0), 20.0);
  let heartbeat = (firstBeat + secondBeat * 0.38) * mix(0.004, 0.016, vitality);

  let softBody = vec3f(
    1.0 + sin(lifeTime * 0.34 + 0.2) * mix(0.045, 0.09, vitality),
    1.0 + sin(lifeTime * 0.27 + 2.2) * mix(0.052, 0.115, vitality),
    1.0 + sin(lifeTime * 0.3 + 4.1) * mix(0.038, 0.078, vitality),
  );

  let primaryLobeDirection = normalize(vec3f(
    sin(lifeTime * 0.42) + 0.22,
    cos(lifeTime * 0.31 + 0.8),
    0.62 + sin(lifeTime * 0.24 + 2.2) * 0.58,
  ));
  let primaryLobe = pow(max(dot(direction, primaryLobeDirection), 0.0), 3.2) *
    mix(0.072, 0.17, vitality);

  let secondaryLobeDirection = normalize(vec3f(
    cos(lifeTime * 0.29 + 2.5),
    sin(lifeTime * 0.37 + 4.0),
    -0.46 + cos(lifeTime * 0.21) * 0.54,
  ));
  let secondaryLobe = pow(max(dot(direction, secondaryLobeDirection), 0.0), 3.8) *
    mix(0.052, 0.13, vitality);

  let tertiaryLobeDirection = normalize(vec3f(
    sin(lifeTime * 0.25 + 4.8),
    0.38 + cos(lifeTime * 0.33 + 1.7) * 0.72,
    cos(lifeTime * 0.27 + 0.4),
  ));
  let tertiaryLobe = pow(max(dot(direction, tertiaryLobeDirection), 0.0), 4.4) *
    mix(0.035, 0.092, vitality);

  let valleyDirection = normalize(vec3f(
    cos(lifeTime * 0.32 + 1.1),
    sin(lifeTime * 0.28 + 2.9),
    cos(lifeTime * 0.19 + 4.7),
  ));
  let movingValley = pow(max(dot(direction, valleyDirection), 0.0), 3.6) *
    mix(0.034, 0.086, vitality);

  let lifeScale = 1.0 + breathing + heartbeat +
    orbWave(direction, lifeTime, vitality) + primaryLobe + secondaryLobe +
    tertiaryLobe - movingValley;
  let swirlAxis = normalize(vec3f(
    0.31 + sin(lifeTime * 0.19) * 0.22,
    0.78,
    0.43 + cos(lifeTime * 0.16) * 0.2,
  ));
  let surfaceDrift = cross(direction, swirlAxis) *
    sin(dot(direction, swirlAxis) * 4.2 + lifeTime * 0.46) *
    mix(0.012, 0.036, vitality);
  let centerDrift = vec3f(
    sin(lifeTime * 0.23 + 0.4),
    sin(lifeTime * 0.19 + 2.3),
    cos(lifeTime * 0.21 + 1.1),
  ) * mix(0.014, 0.034, vitality);
  return position * softBody * lifeScale + surfaceDrift + centerDrift;
}

fn deformOrbNormal(position: vec3f, time: f32, vitality: f32) -> vec3f {
  let radius = max(length(position), 0.0001);
  let direction = position / radius;
  var reference = vec3f(0.0, 1.0, 0.0);
  if (abs(direction.y) > 0.85) {
    reference = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(reference, direction));
  let bitangent = normalize(cross(direction, tangent));
  let epsilon = 0.006;
  let tangentPosition = normalize(direction + tangent * epsilon) * radius;
  let bitangentPosition = normalize(direction + bitangent * epsilon) * radius;
  let center = deformOrb(position, time, vitality);
  let tangentSample = deformOrb(tangentPosition, time, vitality);
  let bitangentSample = deformOrb(bitangentPosition, time, vitality);
  return normalize(cross(tangentSample - center, bitangentSample - center));
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VertexOut {
  let deformedPosition = deformOrb(position, params.time, params.vitality);
  let deformedNormal = deformOrbNormal(position, params.time, params.vitality);
  let world = params.model * vec4f(deformedPosition, 1.0);
  var out: VertexOut;
  out.position = params.viewProjection * world;
  out.worldPosition = world.xyz;
  out.worldNormal = normalize((params.model * vec4f(deformedNormal, 0.0)).xyz);
  out.objectPosition = deformedPosition;
  return out;
}

fn environment(direction: vec3f, level: f32) -> vec3f {
  return sampleHeroEnvironmentLevel(
    environmentTexture,
    environmentSampler,
    rotateHeroEnvironmentDirection(direction, params.environmentRotation),
    level,
  ) * params.environmentExposure;
}

fn fresnelSchlick(cosine: f32) -> vec3f {
  return CERAMIC_F0 + (vec3f(1.0) - CERAMIC_F0) *
    pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
}

fn hash3(position: vec3f) -> f32 {
  return fract(sin(dot(position, vec3f(127.1, 311.7, 74.7))) * 43758.5453123);
}

fn valueNoise(position: vec3f) -> f32 {
  let cell = floor(position);
  let local = fract(position);
  let smoothLocal = local * local * (vec3f(3.0) - 2.0 * local);

  let c000 = hash3(cell + vec3f(0.0, 0.0, 0.0));
  let c100 = hash3(cell + vec3f(1.0, 0.0, 0.0));
  let c010 = hash3(cell + vec3f(0.0, 1.0, 0.0));
  let c110 = hash3(cell + vec3f(1.0, 1.0, 0.0));
  let c001 = hash3(cell + vec3f(0.0, 0.0, 1.0));
  let c101 = hash3(cell + vec3f(1.0, 0.0, 1.0));
  let c011 = hash3(cell + vec3f(0.0, 1.0, 1.0));
  let c111 = hash3(cell + vec3f(1.0, 1.0, 1.0));

  let x00 = mix(c000, c100, smoothLocal.x);
  let x10 = mix(c010, c110, smoothLocal.x);
  let x01 = mix(c001, c101, smoothLocal.x);
  let x11 = mix(c011, c111, smoothLocal.x);
  let y0 = mix(x00, x10, smoothLocal.y);
  let y1 = mix(x01, x11, smoothLocal.y);
  return mix(y0, y1, smoothLocal.z);
}

fn clayNoise(position: vec3f) -> f32 {
  let first = valueNoise(position);
  let second = valueNoise(position * 2.07 + vec3f(5.2, -3.7, 8.1));
  let third = valueNoise(position * 4.11 + vec3f(-2.4, 7.3, 1.9));
  return first * 0.58 + second * 0.29 + third * 0.13;
}

fn microGrain(position: vec3f) -> f32 {
  let cell = floor(position * 116.0);
  return fract(sin(dot(cell, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let view = normalize(params.cameraPosition - in.worldPosition);
  let objectDirection = normalize(in.objectPosition);
  let grainVector = vec3f(
    hash3(floor(in.objectPosition * 94.0) + vec3f(11.0, 0.0, 0.0)),
    hash3(floor(in.objectPosition * 94.0) + vec3f(0.0, 17.0, 0.0)),
    hash3(floor(in.objectPosition * 94.0) + vec3f(0.0, 0.0, 23.0)),
  ) - vec3f(0.5);
  let normal = normalize(in.worldNormal + grainVector * 0.0035);
  let facing = clamp(dot(normal, view), 0.0, 1.0);
  let fresnel = fresnelSchlick(facing);
  let maxEnvironmentLevel = f32(textureNumLevels(environmentTexture) - 1u);

  let lifeTime = params.time * mix(0.74, 1.08, params.vitality);
  let flowPosition = objectDirection * 1.72 + vec3f(
    lifeTime * 0.062,
    -lifeTime * 0.046,
    lifeTime * 0.036,
  );
  let cloud = clayNoise(flowPosition);
  let secondary = clayNoise(
    flowPosition * 0.58 + vec3f(3.7, -2.1, 1.8) +
    vec3f(-lifeTime * 0.034, lifeTime * 0.042, lifeTime * 0.018)
  );
  let tide = 0.5 + 0.5 * sin(
    objectDirection.y * 3.25 +
    objectDirection.x * 1.35 +
    secondary * 3.1 +
    lifeTime * 0.09
  );
  let warmPocket = smoothstep(
    0.58,
    0.91,
    cloud * 0.66 + tide * 0.34,
  );
  let quietPocket = smoothstep(0.12, 0.56, secondary) * (1.0 - warmPocket);

  let deepClay = params.material.baseColor * vec3f(0.62, 0.68, 0.72);
  let firedClay = params.material.baseColor * vec3f(0.96, 0.93, 0.94);
  let luminousClay = min(
    params.material.baseColor * vec3f(1.34, 1.2, 1.13),
    vec3f(1.0),
  );
  var clay = mix(
    deepClay,
    firedClay,
    smoothstep(0.18, 0.86, cloud * 0.84 + secondary * 0.16),
  );
  clay = mix(clay, luminousClay, warmPocket * 0.52);
  clay *= 0.95 + quietPocket * 0.09;
  let roughness = clamp(
    params.material.roughness + (cloud - 0.5) * 0.055 - warmPocket * 0.045,
    0.24,
    0.48,
  );

  let diffuseEnvironment = environment(normal, maxEnvironmentLevel * 0.78);
  let reflectedDirection = reflect(-view, normal);
  let specularEnvironment = environment(
    reflectedDirection,
    roughness * maxEnvironmentLevel,
  );
  let diffuse = clay * (
    diffuseEnvironment * params.material.diffuseStrength +
    vec3f(params.material.ambientStrength * 0.18)
  );
  let specular = specularEnvironment * fresnel *
    params.material.specularStrength * mix(0.82, 0.38, roughness);

  let keyDirection = normalize(vec3f(-0.46, 0.78, 0.42));
  let wrappedKey = pow(
    clamp(dot(normal, keyDirection) * 0.56 + 0.44, 0.0, 1.0),
    1.38,
  );
  let keyLight = clay * vec3f(1.13, 0.94, 0.86) * wrappedKey * 0.24;
  let halfVector = normalize(view + keyDirection);
  let glazeHighlight = vec3f(1.0, 0.78, 0.68) *
    pow(clamp(dot(normal, halfVector), 0.0, 1.0), mix(88.0, 30.0, roughness)) *
    (0.34 + warmPocket * 0.22);
  let softSheen = vec3f(1.0, 0.74, 0.62) *
    pow(clamp(dot(normal, halfVector), 0.0, 1.0), 7.0) * 0.075;
  let warmRim = clay * vec3f(1.2, 0.76, 0.61) *
    pow(1.0 - facing, 3.1) * 0.2;
  let subsurface = vec3f(0.28, 0.062, 0.034) *
    pow(clamp(dot(-normal, keyDirection), 0.0, 1.0), 2.1) *
    pow(1.0 - facing, 1.7) * 0.3;
  let grain = (microGrain(in.objectPosition) - 0.5) * 0.009;
  let currentNoise = clayNoise(
    objectDirection * 1.92 + vec3f(
      lifeTime * 0.052,
      -lifeTime * 0.034,
      lifeTime * 0.026,
    ),
  );
  let currentBand = smoothstep(
    0.56,
    0.92,
    currentNoise * 0.72 +
    (0.5 + 0.5 * sin(objectDirection.y * 2.8 - lifeTime * 0.17)) * 0.28,
  );
  let pulse = 0.68 + 0.32 * sin(lifeTime * 0.92);
  let innerLightDirection = normalize(vec3f(
    sin(lifeTime * 0.44) * 0.86,
    0.28 + cos(lifeTime * 0.37 + 0.8) * 0.68,
    cos(lifeTime * 0.41 + 1.7) * 0.82,
  ));
  let innerFacing = pow(
    clamp(dot(objectDirection, innerLightDirection), 0.0, 1.0),
    2.15,
  );
  let innerAura = vec3f(1.0, 0.43, 0.27) * innerFacing *
    (0.11 + 0.12 * pulse) * (0.62 + warmPocket * 0.38);
  let counterLightDirection = normalize(vec3f(
    cos(lifeTime * 0.31 + 2.4),
    sin(lifeTime * 0.35 + 3.6) * 0.82,
    -0.55 + sin(lifeTime * 0.23) * 0.42,
  ));
  let counterFacing = pow(
    clamp(dot(objectDirection, counterLightDirection), 0.0, 1.0),
    3.1,
  );
  let counterAura = vec3f(0.72, 0.12, 0.055) * counterFacing *
    (0.08 + 0.095 * (1.0 - pulse));
  let livingCurrent = vec3f(1.0, 0.42, 0.24) * currentBand *
    mix(0.075, 0.24, params.vitality) * pulse *
    (0.34 + 0.66 * (1.0 - facing));
  let wetRim = vec3f(1.0, 0.78, 0.68) *
    pow(1.0 - facing, 2.3) * (0.1 + 0.085 * pulse);
  let ceramic = (
    diffuse * (vec3f(1.0) - fresnel) +
    specular +
    keyLight +
    glazeHighlight +
    softSheen +
    warmRim +
    subsurface +
    innerAura +
    counterAura +
    livingCurrent +
    wetRim
  ) * (1.0 + grain);

  return presentCeramic(ceramic);
}
