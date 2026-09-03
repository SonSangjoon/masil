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
  transition: f32,
  form: f32,
  behaviorWeightsA: vec4f,
  behaviorWeightsB: vec4f,
  reaction: f32,
  reactionPhase: f32,
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
  let amplitude = mix(0.78, 1.12, vitality);
  return (
    sin(dot(direction, vec3f(0.811, 0.324, 0.486)) * 2.05 + time * 0.54) * 0.078 +
    sin(dot(direction, vec3f(-0.365, 0.913, 0.183)) * 2.75 - time * 0.39) * 0.052 +
    sin(dot(direction, vec3f(0.214, -0.456, 0.864)) * 4.4 + time * 0.31) * 0.021 +
    sin(dot(direction, vec3f(-0.704, -0.112, 0.701)) * 7.2 - time * 0.22) * 0.008
  ) * amplitude;
}

const CALLIGRAPHY_PATH_POINTS = array<vec2f, 14>(
  vec2f(0.45167, -0.66720),
  vec2f(0.63000, -0.11502),
  vec2f(0.09367, 0.48345),
  vec2f(-0.45975, 0.06875),
  vec2f(-0.50265, -0.48684),
  vec2f(-0.09924, -1.05000),
  vec2f(0.47578, -1.01716),
  vec2f(0.47903, -0.41915),
  vec2f(0.23974, 0.34617),
  vec2f(0.05760, 0.95950),
  vec2f(-0.55189, 1.05000),
  vec2f(-0.63000, 0.39983),
  vec2f(-0.62969, -0.34337),
  vec2f(-0.11540, -0.56008),
);

fn calligraphyPathPoint(index: f32) -> vec2f {
  // This long, irregular closed walk was authored with a minimum 0.55-unit
  // journey and a maximum 92-degree turn between targets. It wanders rather
  // than orbiting, while staying safely inside the requested 120-degree turn.
  let pointCount = 14;
  let wrappedIndex = ((i32(index) % pointCount) + pointCount) % pointCount;
  return CALLIGRAPHY_PATH_POINTS[u32(wrappedIndex)];
}

fn catmullRomPosition(
  p0: vec2f,
  p1: vec2f,
  p2: vec2f,
  p3: vec2f,
  amount: f32,
) -> vec2f {
  let amount2 = amount * amount;
  let amount3 = amount2 * amount;
  return 0.5 * (
    2.0 * p1 +
    (-p0 + p2) * amount +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * amount2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * amount3
  );
}

fn catmullRomTangent(
  p0: vec2f,
  p1: vec2f,
  p2: vec2f,
  p3: vec2f,
  amount: f32,
) -> vec2f {
  let amount2 = amount * amount;
  return 0.5 * (
    (-p0 + p2) +
    2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * amount +
    3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * amount2
  );
}

fn calligraphyDroplet(
  position: vec3f,
  time: f32,
  vitality: f32,
) -> vec3f {
  // Each sweep lasts roughly 2.3-2.8 seconds. Catmull-Rom interpolation keeps
  // both position and heading continuous through the wider, irregular path.
  let pathTime = time * mix(0.36, 0.44, vitality);
  let segment = floor(pathTime);
  let amount = fract(pathTime);
  let p0 = calligraphyPathPoint(segment - 1.0);
  let p1 = calligraphyPathPoint(segment);
  let p2 = calligraphyPathPoint(segment + 1.0);
  let p3 = calligraphyPathPoint(segment + 2.0);
  let pathPosition = catmullRomPosition(p0, p1, p2, p3, amount);
  let pathTangent = catmullRomTangent(p0, p1, p2, p3, amount);
  let tangentLength = max(length(pathTangent), 0.0001);
  let tangent = pathTangent / tangentLength;
  let across = vec2f(-tangent.y, tangent.x);

  // The complete volume streams with its speed. Every vertex participates in
  // the same continuous anisotropic field; there is no front/body/tail region
  // and therefore no seam where a separate stretch appears to begin.
  let flow = mix(0.34, 1.0, smoothstep(0.12, 0.86, tangentLength));
  let axis = clamp(position.y, -1.0, 1.0);
  let direction = normalize(position);
  let surfaceCurrent = sin(
    dot(direction, normalize(vec3f(0.31, 0.8, 0.47))) * 2.4 + time * 1.05
  );
  let dropPulse = 1.0 +
    sin(time * 0.76) * 0.02 +
    surfaceCurrent * mix(0.018, 0.055, flow);
  let alongScale = 0.68 * mix(1.02, 1.38, flow);
  // A linear pressure gradient spans the complete length. It subtly gathers
  // more mass at the leading side while continuously releasing the rear.
  let pressureGradient = 1.0 + axis * mix(0.05, 0.19, flow);
  let crossScale = 0.68 *
    mix(0.98, 0.79, flow) *
    pressureGradient *
    dropPulse;

  var drop = vec3f(
    position.x * crossScale,
    position.y * alongScale * dropPulse,
    position.z * crossScale,
  );
  // Travelling bends displace every cross-section of the droplet. The phase
  // changes continuously from one pole to the other, so the entire mass pours
  // into each new direction instead of one half lagging behind.
  drop.z += sin(time * 0.92 + axis * 1.45) *
    mix(0.035, 0.115, flow);
  drop.x += cos(time * 0.73 - axis * 1.22) *
    mix(0.015, 0.045, flow);
  drop.y += sin(time * 0.64 + axis * 2.05) *
    mix(0.012, 0.048, flow) + 0.015;

  let rotatedY = drop.y * tangent.x + drop.z * across.x;
  let rotatedZ = drop.y * tangent.y + drop.z * across.y;

  return vec3f(
    drop.x,
    rotatedY + pathPosition.x,
    rotatedZ + pathPosition.y,
  );
}

fn deformOrb(
  position: vec3f,
  time: f32,
  vitality: f32,
  transition: f32,
  form: f32,
  reaction: f32,
  reactionPhase: f32,
) -> vec3f {
  let direction = normalize(position);
  let lifeTime = time * mix(0.85, 1.25, vitality);
  let breathing = (
    sin(lifeTime * 0.72) * 0.72 +
    sin(lifeTime * 0.31 + 1.8) * 0.28
  ) * mix(0.033, 0.07, vitality);
  let firstBeat = pow(max(sin(lifeTime * 1.08), 0.0), 16.0);
  let secondBeat = pow(max(sin(lifeTime * 1.08 - 0.65), 0.0), 20.0);
  let heartbeat = (firstBeat + secondBeat * 0.38) * mix(0.0045, 0.018, vitality);

  let softBody = vec3f(
    1.0 + sin(lifeTime * 0.34 + 0.2) * mix(0.05, 0.095, vitality),
    1.0 + sin(lifeTime * 0.27 + 2.2) * mix(0.057, 0.12, vitality),
    1.0 + sin(lifeTime * 0.3 + 4.1) * mix(0.042, 0.084, vitality),
  );

  let primaryLobeDirection = normalize(vec3f(
    sin(lifeTime * 0.42) + 0.22,
    cos(lifeTime * 0.31 + 0.8),
    0.62 + sin(lifeTime * 0.24 + 2.2) * 0.58,
  ));
  let primaryLobe = pow(max(dot(direction, primaryLobeDirection), 0.0), 3.2) *
    mix(0.076, 0.176, vitality);

  let secondaryLobeDirection = normalize(vec3f(
    cos(lifeTime * 0.29 + 2.5),
    sin(lifeTime * 0.37 + 4.0),
    -0.46 + cos(lifeTime * 0.21) * 0.54,
  ));
  let secondaryLobe = pow(max(dot(direction, secondaryLobeDirection), 0.0), 3.8) *
    mix(0.056, 0.136, vitality);

  let tertiaryLobeDirection = normalize(vec3f(
    sin(lifeTime * 0.25 + 4.8),
    0.38 + cos(lifeTime * 0.33 + 1.7) * 0.72,
    cos(lifeTime * 0.27 + 0.4),
  ));
  let tertiaryLobe = pow(max(dot(direction, tertiaryLobeDirection), 0.0), 4.4) *
    mix(0.038, 0.098, vitality);

  let valleyDirection = normalize(vec3f(
    cos(lifeTime * 0.32 + 1.1),
    sin(lifeTime * 0.28 + 2.9),
    cos(lifeTime * 0.19 + 4.7),
  ));
  let movingValley = pow(max(dot(direction, valleyDirection), 0.0), 3.6) *
    mix(0.037, 0.092, vitality);

  let transitionLift = smoothstep(0.0, 0.7, transition) *
    (1.0 - smoothstep(0.72, 1.0, transition) * 0.34);
  let spillDirection = normalize(vec3f(0.22, -0.78, 0.5));
  let spill = pow(max(dot(direction, spillDirection), 0.0), 2.35) *
    transitionLift * 0.22;
  let fold = sin(
    dot(direction, vec3f(0.54, 0.22, 0.81)) * 4.5 + lifeTime * 1.25
  ) * transitionLift * 0.045;

  let lifeScale = 1.0 + breathing + heartbeat +
    orbWave(direction, lifeTime, vitality) + primaryLobe + secondaryLobe +
    tertiaryLobe - movingValley + spill + fold;
  let swirlAxis = normalize(vec3f(
    0.31 + sin(lifeTime * 0.19) * 0.22,
    0.78,
    0.43 + cos(lifeTime * 0.16) * 0.2,
  ));
  let surfaceDrift = cross(direction, swirlAxis) *
    sin(dot(direction, swirlAxis) * 4.2 + lifeTime * 0.46) *
    mix(0.017, 0.047, vitality);
  let centerDrift = vec3f(
    sin(lifeTime * 0.23 + 0.4),
    sin(lifeTime * 0.19 + 2.3),
    cos(lifeTime * 0.21 + 1.1),
  ) * mix(0.017, 0.044, vitality);
  let body = position * softBody * lifeScale + surfaceDrift + centerDrift;
  let calligraphyDrop = calligraphyDroplet(
    position,
    lifeTime,
    vitality,
  );
  var livingForm = mix(body, calligraphyDrop, smoothstep(0.0, 1.0, form));

  let ready = params.behaviorWeightsA.x;
  let listening = params.behaviorWeightsA.y;
  let receiving = params.behaviorWeightsA.z;
  let creating = params.behaviorWeightsA.w;
  let speaking = params.behaviorWeightsB.x;
  let awaiting = params.behaviorWeightsB.y;
  let connected = params.behaviorWeightsB.z;
  let calligraphy = params.behaviorWeightsB.w;

  // Every presence has its own fluid field. These are spatial waves, not
  // global scale presets: the phase travels across the surface so the mass
  // appears to move through itself while keeping one continuous body.
  let readyAxis = normalize(vec3f(0.34, 0.88, 0.33));
  let readyPhase =
    dot(direction, vec3f(0.72, -0.26, 0.64)) * 4.4 - lifeTime * 0.82;
  let restingCurrent = (
    cross(direction, readyAxis) * sin(readyPhase) * 0.022 +
    direction * cos(readyPhase * 0.72 + lifeTime * 0.31) * 0.013
  ) * ready;

  // Listening gathers the surface toward one attentive side, then lets it
  // pour back. A tangential tide makes this feel like a liquid lean rather
  // than an oval being stretched.
  let listeningAxis = normalize(vec3f(0.78, 0.54, 0.24));
  let listeningCoordinate = dot(direction, listeningAxis);
  let listeningPhase = listeningCoordinate * 5.8 - lifeTime * 1.58;
  let listeningTangent =
    listeningAxis - direction * listeningCoordinate;
  let listeningCurrent = (
    listeningTangent * sin(listeningPhase) * 0.052 +
    direction * (
      cos(listeningPhase) * 0.029 +
      sin(listeningCoordinate * 2.6 + lifeTime * 0.67) * 0.014
    )
  ) * listening;

  // Receiving keeps the quick travelling ripple the user identified as the
  // clearest liquid signal, with a slower undertow moving beneath it.
  let behaviorRipple = direction * (
    sin(dot(direction, vec3f(0.58, 0.76, 0.29)) * 11.0 - lifeTime * 7.4) *
    receiving * 0.034
  );
  let receivingUndertow = cross(
    direction,
    normalize(vec3f(-0.18, 0.63, 0.76)),
  ) * sin(
    dot(direction, vec3f(0.74, 0.12, -0.66)) * 4.7 + lifeTime * 1.84
  ) * receiving * 0.032;

  // Creating is a broad two-layer vortex: the outside rolls around one axis
  // while an offset pressure wave folds the volume through the other.
  let makingAxis = normalize(vec3f(0.22, 0.86, 0.46));
  let makingPhase =
    dot(direction, vec3f(0.77, -0.31, 0.55)) * 5.2 + lifeTime * 2.2;
  let makingCurrent = (
    cross(direction, makingAxis) * sin(makingPhase) * 0.073 +
    direction * sin(
      dot(direction, vec3f(-0.43, 0.68, 0.59)) * 7.1 - lifeTime * 1.72
    ) * 0.036
  ) * creating;

  // Speaking pushes pressure rings from one side to the other. The surface
  // slides between pulses, so it reads as a voice travelling through liquid.
  let speakingAxis = normalize(vec3f(-0.42, 0.31, 0.85));
  let speakingCoordinate = dot(direction, speakingAxis);
  let speakingPhase = speakingCoordinate * 9.2 - lifeTime * 5.05;
  let speakingTangent = speakingAxis - direction * speakingCoordinate;
  let speakingCurrent = (
    direction * (
      sin(speakingPhase) * 0.038 +
      sin(speakingCoordinate * 4.1 - lifeTime * 2.35 + 1.2) * 0.018
    ) +
    speakingTangent * cos(speakingPhase * 0.54) * 0.023
  ) * speaking;

  // Awaiting behaves like a slow pool under gravity: mass settles downward,
  // rolls along the skin, and gently returns instead of merely slowing down.
  let settlingAxis = normalize(vec3f(-0.13, -0.96, 0.25));
  let settlingCoordinate = dot(direction, settlingAxis);
  let settlingPhase = settlingCoordinate * 4.0 - lifeTime * 0.76;
  let settlingTangent = settlingAxis - direction * settlingCoordinate;
  let settlingCurrent = (
    settlingTangent * sin(settlingPhase) * 0.038 +
    direction * cos(settlingPhase * 0.78 + lifeTime * 0.24) * 0.021
  ) * awaiting;

  // A completed connection releases one calm rising current, distinct from
  // the alert receiving ripple and the energetic creating vortex.
  let connectedAxis = normalize(vec3f(0.15, 0.93, -0.34));
  let connectedPhase =
    dot(direction, connectedAxis) * 6.2 - lifeTime * 1.18;
  let connectedCurrent = (
    direction * sin(connectedPhase) * 0.024 +
    cross(direction, connectedAxis) * cos(connectedPhase * 0.68) * 0.019
  ) * connected;

  // Calligraphy sends one broad diagonal stroke through the whole body. The
  // leading edge pushes the mass aside, then a slower ink-like wake rolls it
  // back, making the state recognizable without moving or shrinking the Orb.
  let inkAxis = normalize(vec3f(0.84, -0.22, 0.49));
  let inkCoordinate = dot(direction, inkAxis);
  let inkPhase = inkCoordinate * 5.4 - lifeTime * 1.72;
  let inkTangent = inkAxis - direction * inkCoordinate;
  let calligraphyCurrent = (
    inkTangent * cos(inkPhase) * 0.068 +
    direction * (
      sin(inkPhase) * 0.054 +
      sin(inkCoordinate * 9.6 - lifeTime * 2.34 + 0.7) * 0.018
    )
  ) * calligraphy;

  livingForm += restingCurrent + listeningCurrent + behaviorRipple +
    receivingUndertow + makingCurrent + speakingCurrent + settlingCurrent +
    connectedCurrent + calligraphyCurrent;
  livingForm *= vec3f(
    1.0 - receiving * 0.035 + speaking * sin(lifeTime * 3.15) * 0.028 +
      calligraphy * sin(lifeTime * 1.08) * 0.052,
    1.0 + listening * 0.055 + speaking * sin(lifeTime * 3.15 + 0.72) * 0.05 -
      calligraphy * sin(lifeTime * 1.08 + 0.65) * 0.032,
    1.0 - listening * 0.018 + speaking * sin(lifeTime * 3.15 + 1.42) * 0.024 +
      calligraphy * sin(lifeTime * 1.08 + 1.3) * 0.026,
  );

  let recoil = clamp(-reaction, 0.0, 1.0);
  let celebration = clamp(reaction, 0.0, 1.0);
  let tremor = vec3f(
    sin(reactionPhase * 113.0),
    sin(reactionPhase * 157.0 + 0.8),
    cos(reactionPhase * 131.0 + 1.7),
  ) * recoil * 0.052;
  let joyfulWobble = sin(reactionPhase * 6.2831853 * 4.0) * celebration;
  livingForm *= vec3f(
    1.0 - recoil * 0.115 + joyfulWobble * 0.055,
    1.0 - recoil * 0.075 - joyfulWobble * 0.072,
    1.0 - recoil * 0.1 + joyfulWobble * 0.038,
  );
  let impactAxis = normalize(vec3f(0.66, 0.28, 0.7));
  let impactRing = sin(
    dot(direction, impactAxis) * 13.0 - reactionPhase * 22.0
  ) * recoil * (1.0 - reactionPhase * 0.72);
  let risingCoordinate = dot(direction, vec3f(0.0, 1.0, 0.0));
  let joyfulCurrent = (
    vec3f(0.0, 1.0, 0.0) - direction * risingCoordinate
  ) * sin(risingCoordinate * 6.0 - reactionPhase * 18.0) *
    celebration * (1.0 - reactionPhase * 0.55) * 0.044;
  return livingForm + tremor + direction * impactRing * 0.046 + joyfulCurrent;
}

fn deformOrbNormal(
  position: vec3f,
  time: f32,
  vitality: f32,
  transition: f32,
  form: f32,
  reaction: f32,
  reactionPhase: f32,
) -> vec3f {
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
  let center = deformOrb(
    position, time, vitality, transition, form, reaction, reactionPhase,
  );
  let tangentSample = deformOrb(
    tangentPosition,
    time,
    vitality,
    transition,
    form,
    reaction,
    reactionPhase,
  );
  let bitangentSample = deformOrb(
    bitangentPosition,
    time,
    vitality,
    transition,
    form,
    reaction,
    reactionPhase,
  );
  return normalize(cross(tangentSample - center, bitangentSample - center));
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VertexOut {
  let deformedPosition = deformOrb(
    position,
    params.time,
    params.vitality,
    params.transition,
    params.form,
    params.reaction,
    params.reactionPhase,
  );
  let deformedNormal = deformOrbNormal(
    position,
    params.time,
    params.vitality,
    params.transition,
    params.form,
    params.reaction,
    params.reactionPhase,
  );
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

  let transitionFlow = smoothstep(0.0, 0.68, params.transition);
  let lifeTime = params.time * mix(0.82, 1.2, params.vitality) *
    (1.0 + transitionFlow * 0.42);
  let flowPosition = objectDirection * 1.72 + vec3f(
    lifeTime * 0.082,
    -lifeTime * 0.061,
    lifeTime * 0.052,
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
    lifeTime * 0.15
  );
  let warmPocket = smoothstep(
    0.58,
    0.91,
    cloud * 0.66 + tide * 0.34,
  );
  let quietPocket = smoothstep(0.12, 0.56, secondary) * (1.0 - warmPocket);

  let deepClay = params.material.baseColor * vec3f(0.58, 0.5, 0.45);
  let firedClay = params.material.baseColor * vec3f(0.95, 0.9, 0.86);
  let luminousClay = min(
    params.material.baseColor * vec3f(1.24, 1.12, 1.04),
    vec3f(1.0),
  );
  var clay = mix(
    deepClay,
    firedClay,
    smoothstep(0.18, 0.86, cloud * 0.84 + secondary * 0.16),
  );
  clay = mix(clay, luminousClay, warmPocket * 0.4);
  clay *= 0.92 + quietPocket * 0.08;
  let roughness = clamp(
    params.material.roughness + (cloud - 0.5) * 0.055 - warmPocket * 0.045,
    0.12,
    0.38,
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
  let keyLight = clay * vec3f(1.13, 0.94, 0.86) * wrappedKey * 0.21;
  let halfVector = normalize(view + keyDirection);
  let glazeHighlight = vec3f(1.0, 0.78, 0.68) *
    pow(clamp(dot(normal, halfVector), 0.0, 1.0), mix(88.0, 30.0, roughness)) *
    (0.48 + warmPocket * 0.24);
  let softSheen = vec3f(1.0, 0.74, 0.62) *
    pow(clamp(dot(normal, halfVector), 0.0, 1.0), 7.0) * 0.11;
  let warmRim = clay * vec3f(1.2, 0.76, 0.61) *
    pow(1.0 - facing, 3.1) * 0.2;
  let subsurface = vec3f(0.28, 0.062, 0.034) *
    pow(clamp(dot(-normal, keyDirection), 0.0, 1.0), 2.1) *
    pow(1.0 - facing, 1.7) * 0.3;
  let grain = (microGrain(in.objectPosition) - 0.5) * 0.009;
  let currentNoise = clayNoise(
    objectDirection * 1.92 + vec3f(
      lifeTime * 0.074,
      -lifeTime * 0.049,
      lifeTime * 0.041,
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
    sin(lifeTime * 0.56) * 0.86,
    0.28 + cos(lifeTime * 0.48 + 0.8) * 0.68,
    cos(lifeTime * 0.52 + 1.7) * 0.82,
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
  let livingCurrent = vec3f(1.0, 0.4, 0.22) * currentBand *
    mix(0.09, 0.29, params.vitality) * pulse *
    (0.34 + 0.66 * (1.0 - facing));
  let wetRim = vec3f(1.0, 0.78, 0.68) *
    pow(1.0 - facing, 2.3) * (0.1 + 0.085 * pulse);
  var ceramic = (
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

  let celebration = clamp(params.reaction, 0.0, 1.0);
  let recoil = clamp(-params.reaction, 0.0, 1.0);
  ceramic = mix(
    ceramic,
    ceramic * vec3f(1.13, 1.045, 0.99) + vec3f(0.045, 0.009, 0.002),
    celebration * 0.58,
  );
  ceramic *= 1.0 - recoil * 0.115;

  return presentCeramic(ceramic);
}
