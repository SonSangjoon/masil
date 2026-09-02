export interface HeroFractalCamera {
  readonly cameraRotation: readonly [number, number, number];
  readonly cameraDistance: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly fov: number;
  readonly maxMouseRotation: number;
  readonly mouseLerp: number;
}
export interface HeroFractalMaterial {
  readonly baseColor: readonly [number, number, number];
  readonly roughness: number;
  readonly diffuseStrength: number;
  readonly specularStrength: number;
  readonly ambientStrength: number;
}
export interface HeroFractalGlass {
  readonly fractalScale: number;
  readonly orbScale: number;
  readonly orbOffsetY: number;
  readonly sphereMix: number;
  readonly ior: number;
  readonly reflectionStrength: number;
  readonly backOpacity: number;
  readonly absorption: readonly [number, number, number];
  readonly frostRadius: number;
  readonly dispersion: number;
  readonly iridescenceStrength: number;
  readonly iridescenceFrequency: number;
  readonly environmentRotation: readonly [number, number, number];
  readonly environmentExposure: number;
}

export const HERO_FRACTAL_CAMERA = {
  cameraRotation: [0, 0, 0],
  cameraDistance: [5.44, 1.33, 0.55],
  cameraTarget: [0, 0.18, 0],
  fov: 30,
  maxMouseRotation: 7.5,
  mouseLerp: 0.026,
} satisfies HeroFractalCamera;
export const HERO_FRACTAL_MATERIAL = {
  baseColor: [17 / 255, 24 / 255, 32 / 255],
  roughness: 0.24,
  diffuseStrength: 0.19,
  specularStrength: 0.06,
  ambientStrength: 0.34,
} satisfies HeroFractalMaterial;
export const HERO_ORB_MATERIAL = {
  baseColor: [194 / 255, 83 / 255, 59 / 255],
  roughness: 0.12,
  diffuseStrength: 0.76,
  specularStrength: 1.16,
  ambientStrength: 0.34,
} satisfies HeroFractalMaterial;
export const HERO_FRACTAL_GLASS = {
  fractalScale: 0.72,
  orbScale: 0.8,
  orbOffsetY: 0.06,
  sphereMix: 0,
  ior: 1.149,
  reflectionStrength: 0.71,
  backOpacity: 0.19,
  absorption: [74 / 255, 74 / 255, 74 / 255],
  frostRadius: 1.8,
  dispersion: 0.025,
  iridescenceStrength: 0.04,
  iridescenceFrequency: 2,
  environmentRotation: [0, -36, 0],
  environmentExposure: 1.18,
} satisfies HeroFractalGlass;
