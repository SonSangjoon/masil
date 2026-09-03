# MASIL — Reconnecting Korean Elders to Creative Life

> **Korean elders living alone can lose access to the places that sustained their creative lives.
> The web may be the only path left, yet its interface can become a second closed door.**

**MASIL uses WebMCP to turn Agent access into human participation. Korean elders can return to
meaningful creative activity—and expand what is possible—without first mastering the web
interface.**

**Live demo:** [Open MASIL →](https://masil-webmcp.vercel.app) · **3-minute video:** pending final cut

[**Quick start**](#quick-start)

`MASIL` (마실) means casually stepping out into the neighborhood—a small trip that is no longer easy
for the people this project serves.

## The problem

Korean elders represented **20.3% of the population** in 2025, according to the
[Ministry of Data and Statistics](https://www.mods.go.kr/board.es?act=view&bid=10820&list_no=438832&mid=a10301010000),
and the [2024 census](https://www.kostat.go.kr/boardDownload.es?bid=203&list_no=437767&seq=3) counted
**2.289 million one-person households** in that age group. Yet the [2025 Digital Divide Survey](https://www.nia.or.kr/site/nia_kor/ex/bbs/View.do?bcIdx=29168&cbIdx=81623)
scored the older-adult group at **95.4 for digital access but only 56.2 for digital capability**.
A device can be within reach while the activity remains out of reach.

For a homebound Korean elder, the exclusion can happen twice: the physical place that sustained
creative and social life becomes unreachable, while the web alternative introduces unfamiliar
menus, modes, coordinates, and controls.

### Why calligraphy and Janggi?

They are two forms of living Korean heritage sustained through practice and shared place.

- **Calligraphy** appears in national [senior-welfare guidance](https://www.kcpass.or.kr/fileDownload?fileDownType=C&fileId=2&paramMenuId=MENU002030702000000&titleId=tAlhPvqA4H)
  and across multiple centers in a [2025 local program guide](https://health.saha.go.kr/edu/Downfiles/sahaedu_info_202509.pdf).
  Each new phrase and style can require a reference traditionally prepared by a teacher.
- **Janggi** has long served as social infrastructure as well as a game. At Seoul's Tapgol Park,
  a [30-year tradition](https://v.daum.net/v/20250825200046781) gathered play, debate, and
  conversation; [later reporting](https://www.hankookilbo.com/news/article/A2026011018500002067)
  described the community dispersing after the boards were removed.

## What MASIL makes possible

> **The Agent expands what is possible. WebMCP turns that capability into a live activity the
> elder can enter and continue without first learning the interface.**

MASIL is a live creative space where the elder begins with familiar language, receives an Agent
contribution through WebMCP, and continues the same activity directly.

| Approach | What it provides | Where it stops |
| --- | --- | --- |
| Voice Agent alone | Language understanding and generation | It can answer or create an asset, but the result remains outside a live activity. |
| Fixed accessible UI alone | Visible state and human-operable controls | The elder must still learn its controls and remain within predetermined content. |
| **Agent + WebMCP + live Web UI** | Generation, interpretation, provider-owned state, and bidirectional interaction | Agent access becomes participation in one visible, continuing activity. |

### Calligraphy: imagination beyond a fixed library

**Need:** A fixed library cannot anticipate every phrase or brush style, and the teacher who once
prepared a reference may no longer be within reach.

**Experience:** The Agent creates the requested reference; WebMCP places it on the live canvas as a
separate layer; the elder writes over it. Every request can become a new starting point, so the
activity is no longer confined to material someone prepared in advance.

### Janggi: familiar language becomes a complete match

**Need:** Decades of Janggi experience do not teach coordinates, piece IDs, or web-game controls.

**Experience:** WebMCP supplies the live position, turn, and legal moves; the Agent resolves the
elder's familiar shorthand; MASIL validates the move. The Agent takes the other side, and the
elder's direct move returns to it so the same match continues.

## Why WebMCP is necessary

```text
elder's words
→ Agent interpretation or generation
→ WebMCP tool
→ MASIL validation and visible state
→ elder's direct action
→ waiting Agent continues from the changed state
```

An Agent alone does not own MASIL's canvas, board, rules, turn order, or valid actions. Computer Use
can click visible controls, but it must infer meaning and state from a human-facing interface. A
fixed UI can hold state, but it cannot generate every creative starting point or understand evolving
human language.

WebMCP lets the Agent turn the elder's familiar words and newly generated ideas into a live web
activity, then continue from what happens on the page. The elder no longer has to learn the
interface before creating or playing; the activity can begin in familiar language and keep
expanding through the Agent.

## Verification status

The creative journeys are being evaluated against a frozen task set. The evaluation measures
whether the requested activity succeeds—not merely whether a tool was called.
No final success rate, accessibility outcome, institutional adoption, or reduction in social
isolation is claimed before the corresponding evidence is frozen.

See [Evaluation](docs/EVALUATION.md) for the method and publication gate and [WebMCP design](docs/WEBMCP.md)
for the technical contract.

## Built for one continuing experience

MASIL uses the elder's existing Agent rather than embedding a second conversational model. It
registers semantic tools with `document.modelContext.registerTool()` and returns structured state
after each operation. The application uses Next.js, React, and TypeScript; WebGPU and Vercel Labs'
`vGPU` render the creative spaces, while ONNX Runtime Web supports local hand tracking.

## Documentation

- [Documentation guide](docs/README.md) — choose the right document by question
- [Product definition](docs/PRODUCT.md) — audience, capability, principles, and non-goals
- [Creative service design](docs/SERVICE-DESIGN.md) — calligraphy and Janggi journeys
- [WebMCP design](docs/WEBMCP.md) — tools, state, validation, and bidirectional interaction
- [Evaluation](docs/EVALUATION.md) — frozen tasks, iterations, results, and evidence gate
- [Evidence and Korean context](docs/EVIDENCE.md) — sources, interpretations, and claim ceilings
- [Long-term vision](docs/VISION.md) — conditional social and institutional hypotheses

## Long-term direction

MASIL begins with creative life because it must be valuable before it asks for trust. Only after
that experience proves useful could it become a voluntary path to human support. This is not a
current feature; its requirements are isolated in [Long-term vision](docs/VISION.md).

## Quick start

MASIL uses Node.js 24, npm, Next.js App Router, TypeScript, and ESLint.

```bash
npm install
npm run dev
```

Open the local URL in an Agent host with WebMCP support. Before opening a pull request, run the
same checks used by CI:

```bash
npm run lint
npm run typecheck
npm run build
```

Deployment uses Vercel's Git integration. Pull requests create Preview deployments, and `main`
deploys to [masil-webmcp.vercel.app](https://masil-webmcp.vercel.app). No Vercel deployment token
is stored in this repository.

## License

MASIL is licensed under the [MIT License](LICENSE). Third-party software, fonts, and media retain
their own licenses.
