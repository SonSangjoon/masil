# vGPU Air Painting adaptation

The hand-tracking, ONNX Runtime WebGPU, persistent paint-mask, and WebGPU
pipeline files in this directory are adapted from Vercel Labs' `vgpu`
`air-painting` example:

https://github.com/vercel-labs/vgpu/tree/main/apps/docs/examples/air-painting

Upstream revision used for this PoC:
`671d1be9ea0128f0243292710255800808e71b49`

The upstream code is distributed under the MIT License preserved in
`LICENSE.vgpu`.

MASIL keeps the frosted camera reveal as a private local visual layer and adds
a crisp-edged translucent calligraphy reference plus the persistent ink mask
above it. The local hand landmarks also vary brush radius from a thumb-to-index
gesture. Camera frames remain local; they are rendered only inside the user's
WebGPU canvas and are never uploaded or persisted.

The converted MediaPipe models and their separate Apache-2.0 notices are stored
under `public/models/mediapipe-hands/`.
