# WebMCP design

This document owns MASIL's WebMCP architecture, creative tool contract, provider state, validation,
and bidirectional execution boundaries. Product meaning is defined in [Product definition](PRODUCT.md);
performance claims are governed by [Evaluation](EVALUATION.md).

## Why WebMCP is necessary

The person speaks or types to their existing Agent. The Agent can interpret language and generate
new material, but it does not own MASIL's live canvas, Janggi position, rules, permissions, or
current turn.

MASIL exposes those provider-owned capabilities and states through WebMCP. The resulting action
appears in the real page, where the elder can inspect it, change it, or act directly. A human action
can then return as structured state to the waiting Agent.

```text
elder's words
→ Agent interpretation or generation
→ WebMCP tool
→ MASIL validation
→ visible activity state
→ elder's direct action
→ waiting Agent continues
```

MASIL itself is the WebMCP provider. No external community center or public institution is assumed
to expose WebMCP.

## One Agent and one visible surface

The elder's existing Agent owns conversation, microphone input, spoken output, interruption,
reasoning, generation, and private context. MASIL does not embed a second Agent, model, Realtime
client, API key, browser STT, or browser TTS.

MASIL owns:

- the visible activity and current scene;
- calligraphy reference and human-stroke layers;
- the Janggi position, turn, history, and legal moves;
- provider validation and state revision;
- the set of currently valid operations; and
- the visible execution history.

The host may project a coarse Agent phase such as `ready`, `creating`, `speaking`, or `awaiting`
into the page. MASIL must not receive raw audio, full transcripts, token streams, private Agent
memory, or inferred emotion.

## Tool registration

The current page registers 13 imperative tools with
`document.modelContext.registerTool()`. Registration makes a tool discoverable; it does not make
every call valid. Handlers still enforce scene, turn, input, revision, and human-gesture boundaries.

### Current creative contract — 8 tools

These tools form the product experience described in the README and Devpost story.

| Tool | Responsibility |
| --- | --- |
| `masil_get_capabilities` | Describes available creative activities, asset requirements, and interaction boundaries |
| `masil_get_session_state` | Returns the visible scene, revision, preserved creative state, and valid next actions |
| `masil_project_agent_presence` | Projects a coarse, non-audio Agent phase into the Orb and current activity |
| `masil_open_activity` | Opens calligraphy or Janggi after the elder expresses that intention |
| `masil_set_calligraphy_reference` | Places an Agent-generated reference without changing human strokes |
| `masil_get_janggi_state` | Returns the exact board, turn, coordinate convention, history, and legal moves |
| `masil_move_janggi_piece` | Validates and visibly animates one semantic elder or Agent move |
| `masil_wait_for_person_janggi_move` | Waits inside an active Agent turn for one direct human board move |

### Local experimental surface — 5 tools

The working tree also registers five local-only tools:

- `masil_open_support_note`
- `masil_prepare_support_review`
- `masil_create_local_handoff`
- `masil_get_handoff_status`
- `masil_return_to_activity`

They transmit nothing externally and do not establish an institutional service. They are excluded
from MASIL's current product and creative service journey. Their possible purpose belongs only in
[Long-term vision](VISION.md). Before release, the code, Devpost tool count, and public documentation
must make this experimental status equally clear.

## State-valid actions

The creative product has three relevant visible states:

| Scene | Additional valid tools | Provider-owned boundary |
| --- | --- | --- |
| `home` | `masil_open_activity` | Open only the activity the elder requested |
| `activity / calligraphy` | `masil_set_calligraphy_reference` | The Agent may change only the reference layer; camera access still requires a fresh human gesture |
| `activity / janggi` | `masil_get_janggi_state`, `masil_move_janggi_piece`, and `masil_wait_for_person_janggi_move` on the elder's turn | MASIL, not the model, owns rules, turn order, legal moves, and animation completion |

`masil_get_capabilities`, `masil_get_session_state`, and
`masil_project_agent_presence` remain available across these scenes.

The catalog may remain stably registered to avoid registration races. The page returns
`validNextActions` so the Agent can distinguish discoverability from current usability.

## Calligraphy contract

### Why Agent generation is necessary

A fixed library cannot contain every phrase and brush style an elder may want. The Agent therefore
creates the requested raster reference rather than selecting the nearest predefined template.

### Why WebMCP is necessary

The result must enter the correct live canvas, preserve its meaning and accessible description, and
remain separate from the elder's own strokes. A generated asset left in chat does not create that
experience.

### Reference asset requirements

The tool description and schema require the Agent to:

- render the complete one-to-four-character Korean or Hanja phrase in one image;
- use solid black brush-calligraphy strokes;
- provide a real transparent alpha channel, preferably PNG;
- include safe margins so the full work fits on one screen;
- omit paper, checkerboard, seals, signatures, decoration, translation, and extra text; and
- supply accessible alt text.

The page accepts a readable image data URL, same-origin URL, or HTTPS URL. It rejects local
filesystem paths and Agent-context `blob:` URLs that the page cannot resolve.

MASIL fits the complete image with `object-fit: contain`. The Agent reference layer and WebGPU
human-stroke layer remain independent.

Receiving a reference is not camera consent. Camera access begins only after a fresh human gesture
on the visible air-writing control. Denial or failure leaves direct on-screen drawing available.

## Janggi contract

Spoken and directly manipulated moves must reach the same position and rules engine:

1. The Agent reads `masil_get_janggi_state`; it does not infer the board from pixels.
2. For a spoken move, the Agent resolves familiar Korean against stable piece IDs and legal
   destinations returned by the provider.
3. The Agent calls `masil_move_janggi_piece` with the resolved semantic move.
4. MASIL validates the move and completes the visible vGPU animation before returning success.
5. For a direct move, the elder selects or drags a piece to a displayed legal destination while
   `masil_wait_for_person_janggi_move` is pending.
6. The completed human move returns the updated state and signals that the Agent should reply.
7. The same Agent re-reads the changed board and takes the opposing turn.

This division is essential:

- the Agent understands expressions such as `포 사용해서 위쪽 차 먹어줘`;
- MASIL supplies the exact pieces, screen pieces, turn, and legal destinations;
- WebMCP binds interpretation to provider truth; and
- the elder sees and can directly change the same match.

An illegal, ambiguous, stale, or out-of-turn request must return a recoverable result rather than an
invented move.

## Shared provider state

### `activity_work`

Contains only the active creative mode, calligraphy reference, human drawing state, Janggi position,
turn, history, animation boundary, current revision, and valid next actions.

### `agent_projection`

Contains only the current visible phase and an optional short caption. It is transient presentation
state, not a conversation record.

Private Agent memory, raw audio, full transcripts, camera frames, and inferred personal states do
not belong in either object.

## Why existing alternatives stop short

| Alternative | Missing relationship |
| --- | --- |
| Agent conversation alone | It can understand or generate, but it does not own the live activity the elder must be able to continue |
| Strong fixed accessible UI | It still requires the elder to learn controls and limits the activity to content the interface anticipated |
| Computer Use | It infers meaning and state from pixels and human-facing controls rather than receiving provider-owned truth |
| Backend MCP | It can perform structured operations while bypassing the person-visible page where authorship and direct action continue |
| **MASIL with WebMCP** | The Agent receives exact provider state while the elder retains a visible, shapeable, interruptible activity |

The WebMCP claim fails if an Agent answer, a predetermined interface, or pixel clicking can deliver
the same creative starting point, live authorship, legal continuity, and human-to-Agent return path.

## Creative-product invariants

- `validNextActions` and handler guards agree.
- Invalid, stale, malformed, blocked, or out-of-turn operations leave authoritative state intact.
- Replacing a calligraphy reference never overwrites human strokes.
- Camera access always retains a fresh human-gesture boundary.
- Agent-led and direct Janggi moves reach the same provider state.
- A waiting human-move call resolves only after the visible move completes, times out, or is
  cancelled.
- Tool results, page revision, visible activity, and execution history agree.
- The page receives no raw audio, full transcript, camera frame, or private Agent memory.

## Evaluation boundary

[Evaluation](EVALUATION.md) defines scenario success, the without-WebMCP control, iteration policy,
and publication gate. This document defines what the provider must keep true; it does not claim that
the current contract has already passed the frozen suite or connected judge journey.

A registered-tool badge, static animation, narrated mock, or Computer Use recreation does not
satisfy the product contract. The requested activity must be correct, visible, continuing, and
supported by matching state and execution evidence.
