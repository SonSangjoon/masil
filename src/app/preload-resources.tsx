"use client";

import ReactDOM from "react-dom";

import {
  HERO_ENVIRONMENT_URL,
  HERO_FRACTAL_MESH_URL,
  HERO_GLASS_MESH_URL,
} from "@/features/presence/runtime/hero-glass-asset-urls";

export function PreloadResources() {
  ReactDOM.preload(HERO_FRACTAL_MESH_URL, {
    as: "fetch",
    crossOrigin: "anonymous",
    fetchPriority: "high",
  });
  ReactDOM.preload(HERO_ENVIRONMENT_URL, {
    as: "image",
    fetchPriority: "high",
    type: "image/png",
  });
  ReactDOM.preload(HERO_GLASS_MESH_URL, {
    as: "fetch",
    crossOrigin: "anonymous",
  });

  return null;
}
