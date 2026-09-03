# Creative service design

> **MASIL is not a voice layer placed on top of a conventional website. It is one continuing
> creative activity shared by a Korean elder, their Agent, and a live Web UI through WebMCP.**

This document describes the current calligraphy and Janggi service journeys. Institutional
connection, welfare intake, and human-support routing are outside the current service and belong
only in [Long-term vision](VISION.md).

## The service outcome

The service succeeds when a Korean elder can begin from familiar language, receive an Agent
contribution inside a real activity, shape or continue it directly, and let that action influence
what the Agent does next. The outcome is creative participation, not successful interface
operation.

## One experience, three channels

| Channel | Carries | Does not carry |
| --- | --- | --- |
| Agent conversation | Language, context, interpretation, generation, and explanation | Provider truth, visible authorship, or direct spatial action |
| Live Web UI | Canvas, board, layers, relationships, visible outcomes, and direct human action | Private conversational context or open-ended reasoning |
| WebMCP | Semantic tools, structured state, validation results, and the return path from human action to Agent | Human intention, model judgment, or visual experience on its own |

The elder does not choose between “using the Agent” and “using the website.” Conversation and direct
interaction are two ways of participating in the same provider-owned state.

## Entry journey

### Starting moment

The elder wants to practice calligraphy or play Janggi. They do not need to locate the correct page,
select a mode, configure controls, or learn a command vocabulary.

### Flow

1. The elder tells their Agent what they want to do.
2. The Agent discovers MASIL's current capabilities and state through WebMCP.
3. The Agent opens the requested activity semantically.
4. MASIL visibly changes into the corresponding creative space.
5. The elder continues in familiar language or acts directly in the activity.

### Design requirement

The first meaningful result must be the activity itself, not an explanation of the interface.

## Journey 1 — calligraphy

### Why the journey exists

A new phrase can require a new reference and brush style. In an offline class, a teacher may prepare
that starting point. A fixed online library cannot anticipate every phrase, occasion, or aesthetic
choice.

### Service blueprint

| Moment | Korean elder | Agent | WebMCP and provider | Visible Web UI |
| --- | --- | --- | --- | --- |
| Express | Asks for a phrase such as `추석` and describes the desired style | Understands the request and determines that a new reference is needed | Returns the current activity state and reference contract | Shows the calligraphy space without requiring menu navigation |
| Create | Waits for a usable starting point | Generates one complete transparent calligraphy reference | Validates text, image URL, and accessible description | Shows a clear creating state rather than a fake finished result |
| Place | Sees the requested phrase appear | Calls the semantic reference tool | Places the image on the Agent-authored reference layer and advances the revision | Fits the full reference on the live canvas |
| Continue | Begins air writing or direct drawing | Remains available without taking over the work | Keeps reference and human-stroke layers independent | Preserves every human stroke as the elder's contribution |
| Revise | Requests another phrase or style when desired | Generates a new starting point | Replaces only the reference layer | Keeps human work intact |

### Essential experience

The Agent does not simply show an image. It makes a new creative starting point available inside the
activity. The elder continues from it, changes it through their own marks, and remains the author.

### Failure and recovery

- If the generated image is unreadable, malformed, or inaccessible to the page, MASIL rejects it
  without changing the current canvas.
- If camera permission is denied or tracking fails, direct drawing remains available.
- If the elder requests a new reference, existing human strokes must not disappear.
- A visible failure should lead to correction or retry, not a silent fallback to unrelated sample
  content.

## Journey 2 — Janggi

### Why the journey exists

An experienced Janggi player understands pieces through their relationships on the board and speaks
in the shorthand used during real play. Conventional web games ask that person to adopt coordinates,
piece IDs, menus, and unfamiliar control grammar before the first move.

### Service blueprint

| Moment | Korean elder | Agent | WebMCP and provider | Visible Web UI |
| --- | --- | --- | --- | --- |
| Begin | Says they want to play Janggi | Opens the activity and reads the live position | Returns turn, orientation, pieces, history, and legal moves | Presents the real board rather than setup controls |
| Describe a move | Uses familiar language such as `포 사용해서 위쪽 차 먹어줘` | Resolves the expression against the current board | Supplies exact provider state and validates the selected move | Highlights or animates only a legal result |
| Agent turn | Watches the match continue | Takes the opposing side and selects a response | Applies the same rules and advances the authoritative state | Animates the Agent move on the same board |
| Direct move | Selects or drags a piece to a legal destination | Waits rather than competing with the human action | Receives the completed move and returns the updated position | Shows direct control and the resulting turn change |
| Continue | Responds in words or directly on the board | Re-reads the changed state and continues | Preserves one history and one rules engine | Keeps the same match coherent across both input paths |

### Essential experience

The Agent is not a one-command translator. It understands how the elder speaks, takes the other
side, and continues from the exact board the elder can also change directly.

### Failure and recovery

- If a phrase maps to more than one legal move, the Agent asks for clarification.
- If no legal move matches, MASIL leaves the board unchanged and returns a recoverable explanation.
- If the turn changes before execution, stale input must not alter the board.
- If a direct-move wait times out or is cancelled, the existing position remains intact.
- Spoken, selected, and dragged moves must never create different rules outcomes.

## The bidirectional moment

The most important WebMCP-native moment is not the Agent changing the page. It is the page returning
a meaningful human action to the same waiting Agent:

```text
Agent changes the live activity
→ elder sees and acts in that activity
→ MASIL validates the human action
→ WebMCP returns the changed state
→ Agent re-judges what to do next
```

Without this return path, the Web UI is only an output surface. With it, the elder and Agent
genuinely share the activity.

## Human participation and control

MASIL preserves control through the structure of the activity rather than by adding approval
dialogs to every step.

- The elder chooses the phrase, style, move, correction, and stopping point.
- Human brushstrokes remain independent from Agent-generated reference material.
- The elder can act directly on the live Janggi board.
- Provider validation prevents the Agent from inventing legal truth.
- A person-visible result always follows a successful mutation.
- Recoverable failure leaves the previous meaningful state intact.

## Experience principles

1. **Do not make navigation the first task.** Begin from the desired activity.
2. **Do not replace a rich activity with a simplified imitation.** Preserve the full calligraphy
   practice and full Janggi rules.
3. **Do not require machine language.** Accept familiar Korean and ground it in provider state.
4. **Do not make the Agent invisible.** Its contribution must become legible in the shared space.
5. **Do not make the person passive.** Their marks and moves must remain consequential.
6. **Do not make direct interaction mandatory.** It is an additional language, not an entrance exam.
7. **Do not confuse access with outcome.** Success is creative participation, not tool invocation.

## Target-user research questions

The technical success criteria are owned by [Evaluation](EVALUATION.md). They do not establish
accessibility success. A later pilot must ask:

- Can an elder begin without being taught where controls are?
- Can they tell what the Agent added and what remains theirs?
- Can they correct an unwanted reference or move?
- Does familiar Korean reduce explanation compared with a conventional interface?
- Can they resume after interruption without starting over?
- Does the experience feel like calligraphy or Janggi rather than a simplified accessibility demo?

## Current boundary

This service design ends with creative activity. It does not include welfare detection, institutional
routing, case creation, or care coordination. Any future bridge must earn trust through the current
experience first and meet the separate conditions in [Long-term vision](VISION.md).
