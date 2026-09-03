import type { Draw, Gpu, Surface } from "vgpu";
import { draw, geometry } from "vgpu";
import { sphere } from "vgpu/scene";

import heroDebugAxesWgsl from "./hero-debug-axes.wgsl";
import heroFractalWireframeWgsl from "./hero-fractal-wireframe.wgsl";
import heroGlassEnvironmentDebugWgsl from "./hero-glass-environment-debug.wgsl";
import type { HeroGlassAssets } from "./hero-glass-assets";
import heroGlassWireframeWgsl from "./hero-glass-wireframe.wgsl";

export interface HeroFractalDebugDraws {
  readonly glassWireframe: Draw;
  readonly fractalWireframe: Draw;
  readonly environmentSphere: Draw;
  readonly worldAxes: Draw;
  readonly cameraTargetAxes: Draw;
}

export async function createHeroFractalDebugDraws(
  gpu: Gpu,
  canvasSurface: Surface,
  assets: HeroGlassAssets,
): Promise<HeroFractalDebugDraws> {
  const environmentSphereGeometry = geometry(
    gpu,
    sphere({
      radius: 0.82,
      widthSegments: 48,
      heightSegments: 24,
    }),
  );
  const debugAxesGeometry = createDebugAxesGeometry(gpu);
  const draws = {
    glassWireframe: draw(gpu, {
      shader: heroGlassWireframeWgsl,
      geometry: assets.wireframeGeometry,
      cull: "none",
      depth: false,
      blend: "premultiplied",
      label: "homepage-light-glass-wireframe",
    }),
    fractalWireframe: draw(gpu, {
      shader: heroFractalWireframeWgsl,
      geometry: assets.fractalWireframeGeometry,
      instances: 4,
      cull: "none",
      depth: false,
      blend: "premultiplied",
      label: "homepage-light-fractal-mesh-wireframe",
    }),
    environmentSphere: draw(gpu, {
      shader: heroGlassEnvironmentDebugWgsl,
      geometry: environmentSphereGeometry,
      cull: "back",
      depth: false,
      label: "homepage-light-glass-environment-debug",
    }),
    worldAxes: draw(gpu, {
      shader: heroDebugAxesWgsl,
      geometry: debugAxesGeometry,
      cull: "none",
      depth: false,
      blend: "premultiplied",
      label: "homepage-light-world-axes-debug",
    }),
    cameraTargetAxes: draw(gpu, {
      shader: heroDebugAxesWgsl,
      geometry: debugAxesGeometry,
      cull: "none",
      depth: false,
      blend: "premultiplied",
      label: "homepage-light-camera-target-axes-debug",
    }),
  } satisfies HeroFractalDebugDraws;

  await Promise.all([
    draws.glassWireframe.compile({ colors: [canvasSurface.format] }),
    draws.fractalWireframe.compile({ colors: [canvasSurface.format] }),
    draws.environmentSphere.compile({ colors: [canvasSurface.format] }),
    draws.worldAxes.compile({ colors: [canvasSurface.format] }),
    draws.cameraTargetAxes.compile({ colors: [canvasSurface.format] }),
  ]);

  return draws;
}

function createDebugAxesGeometry(gpu: Gpu) {
  const vertices: number[] = [];
  const corners = [
    [0, -1],
    [0, 1],
    [1, 1],
    [0, -1],
    [1, 1],
    [1, -1],
  ] as const;
  const axes = [
    { end: [1, 0, 0], color: [1, 0.08, 0.05] },
    { end: [0, 1, 0], color: [0.1, 0.78, 0.18] },
    { end: [0, 0, 1], color: [0.05, 0.36, 1] },
  ] as const;

  for (const axis of axes) {
    for (const corner of corners) {
      vertices.push(0, 0, 0, ...axis.end, ...axis.color, ...corner);
    }
  }

  return geometry(gpu, {
    label: "homepage-light-debug-axes",
    buffers: [
      {
        data: new Float32Array(vertices),
        stride: 44,
        attributes: {
          line_start: "float32x3",
          line_end: "float32x3",
          axis_color: "float32x3",
          corner: "float32x2",
        },
      },
    ],
  });
}
