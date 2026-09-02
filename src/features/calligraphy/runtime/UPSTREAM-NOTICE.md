# vGPU Air Painting adaptation

The hand-tracking, ONNX Runtime WebGPU, persistent paint-mask, and WebGPU
pipeline files in this directory are adapted from Vercel Labs' `vgpu`
`air-painting` example:

https://github.com/vercel-labs/vgpu/tree/main/apps/docs/examples/air-painting

Upstream revision used for this PoC:
`671d1be9ea0128f0243292710255800808e71b49`

The upstream code is distributed under the MIT License preserved in
`LICENSE.vgpu`.

MASIL changes the visual compositor from a frosted camera reveal to a private
calligraphy surface. Camera frames remain local and are used only as input to
the hand landmark pipeline; MASIL does not render, upload, or persist them.

The converted MediaPipe models and their separate Apache-2.0 notices are stored
under `public/models/mediapipe-hands/`.
