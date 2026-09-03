# Evaluation

> **Status: evaluation in progress. No success rate, winning iteration, or improvement claim is
> published until the run is frozen and its artifacts agree with connected-browser evidence.**

MASIL evaluates whether WebMCP helps an Agent complete the creative activity the elder actually
wanted. A discovered tool, successful handler return, or visible animation is not sufficient on its
own.

## 1. Evaluation question

> Does an iterated WebMCP surface turn an elder's real request into a correct, visible, continuing
> creative activity more reliably than the same Agent working without WebMCP?

Success is boolean at the scenario level. A partial answer, approximate visual imitation, Computer
Use recreation, or tool call without the required human-visible outcome remains a failure.

## 2. Controlled comparison

Every condition uses the same frozen tasks, assertions, Agent profile, repetition policy, and result
format.

1. **Without-WebMCP control** — the Agent may reason and use ordinary available capabilities but
   receives none of MASIL's semantic tools or provider-owned state.
2. **WebMCP candidates** — the Agent receives one version of MASIL's contract. Each candidate
   changes a bounded part of that contract, such as a tool description, schema, state result, or
   provider guard.
3. **Final retained candidate** — publishable only if it improves the frozen suite without weakening
   safety, recovery, or truthfulness assertions.

The control is not a deliberately weak chatbot prompt. It is the strongest fair attempt available
to the same Agent without MASIL's WebMCP surface.

## 3. What counts as success

### Calligraphy

The scenario passes only when all of the following are true:

- the Agent understands the requested Korean phrase and brush style;
- it creates a usable reference that matches both;
- the reference enters the live calligraphy canvas through WebMCP; and
- the elder's strokes remain intact as a separate human-authored layer.

A correct image left in chat, a predefined sample substituted for the request, or a successful tool
call with an unusable canvas result fails the scenario.

### Janggi

The scenario passes only when all of the following are true:

- the Agent resolves familiar, coordinate-free Korean against the actual position and turn;
- the selected move is legal under MASIL's complete rules engine;
- MASIL validates and visibly executes that exact move; and
- the match continues from the updated provider-owned board.

An explanation of the move, a coordinate guess, an illegal mutation, or a board animation that does
not become the next authoritative state fails the scenario.

### Cross-experience invariants

- A direct human action changes provider-owned state and the waiting Agent continues from that exact
  state rather than stale conversational context.
- Invalid, ambiguous, stale, malformed, or out-of-turn actions do not mutate authoritative state.
- Visible state, page revision, WebMCP result, and execution history agree.
- A scenario cannot pass by recreating the appearance of the outcome through Computer Use.

## 4. WebMCP surface iteration

1. Freeze realistic requests and assertion-based outcomes before running a candidate.
2. Run the without-WebMCP control and retain its full manifest.
3. Run one WebMCP candidate against the identical suite.
4. Classify each failure by the first broken link in the experience, not by model confidence.
5. Change one bounded part of the Agent-facing WebMCP surface.
6. Re-run the full frozen suite and retain the change only when verified task success improves.
7. Preserve failed and withheld cases; never lower the success definition to improve the result.

The WebMCP surface is treated as an Agent-facing product interface that can be evaluated and
improved—not as static plumbing assumed to work once a tool is callable.

## 5. Iteration and results record

| Record | Publication state |
| --- | --- |
| Frozen task-set identifier and hash | Pending frozen artifact |
| Agent and model configuration | Pending frozen artifact |
| Repetitions and completed sessions | Pending frozen artifact |
| Without-WebMCP result | Pending frozen artifact |
| Candidate versions and bounded change per iteration | Pending frozen artifact |
| Completed and retained iteration count | Pending frozen artifact |
| Baseline-to-final calligraphy result | Pending frozen artifact |
| Baseline-to-final Janggi result | Pending frozen artifact |
| Token use and wall time | Pending frozen artifact |

Values will be copied verbatim from the immutable run manifest after reconciliation. Interim output
does not belong in this table, the public README, or Devpost.

## 6. Failures, withheld cases, and claim ceiling

Failures are retained under these categories:

- **Answer outside the activity:** the Agent explains or generates something, but it never becomes
  usable material in the live Web UI.
- **Intent mismatch:** the output reaches MASIL but does not match the requested phrase, style, or
  move.
- **Grounding failure:** the Agent ignores or misreads provider-owned state, turn, or legal actions.
- **Execution-only success:** a tool returns successfully without the required visible and
  continuing human outcome.
- **Continuity failure:** the page changes, but the waiting Agent continues from stale state.
- **Unsafe mutation:** an invalid, ambiguous, stale, or unconfirmed action changes authoritative
  state.
- **Evidence mismatch:** tool result, page revision, execution history, and visible outcome disagree.

This evaluation can support a claim about task completion under its exact Agent, tasks, and runtime.
It cannot establish accessibility for Korean elders, adoption, reduced isolation, institutional
value, or a social outcome. Those require direct target-user and field evidence.

## 7. Reproducible artifacts

| Artifact | Required contents | Public link |
| --- | --- | --- |
| Frozen task set | Prompts, success assertions, categories, version, and hash | Pending freeze |
| Run manifest | Condition, Agent configuration, repetitions, tokens, timing, and artifact hashes | Pending freeze |
| Task trajectories | Tool calls, structured results, assertions, and first failure point | Pending freeze |
| Comparison report | Without-WebMCP baseline, each candidate, retained result, and failures | Pending freeze |
| Connected-browser evidence | Exact client, deployment revision, request, visible state, and execution history | Pending judge run |

The final repository version will replace each placeholder with a relative link to the frozen
artifact. Connected-browser evidence must also reconcile with the private submission checklist in
`judge-testing.md` before any result becomes public.

## 8. Results publication gate

The public result remains empty until all of the following are true:

- the frozen manifest identifies the exact task set, configuration, and repetitions;
- the control and final candidate have complete artifacts under the same evaluation contract;
- task-level assertions, aggregate metrics, token use, and timing reconcile;
- the connected judge journey runs on the same deployable product behavior;
- the visible outcome and execution evidence agree; and
- limitations, failed cases, and withheld cases appear beside the improvement.

When this gate passes, this document will publish the without-WebMCP result, every retained
iteration, final category results, strongest failures, and direct artifact links. Until then, MASIL
claims an evaluation method—not an evaluation outcome.
