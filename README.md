# MASIL

> **When the community center is out of reach and the web is impossible to
> navigate, where does creative life go?**

> **MASIL reconnects digitally excluded older Koreans living alone with the
> creative activities that once shaped their everyday lives—from calligraphy
> to Janggi—through their own Agent and WebMCP.**

`MASIL` (마실) is a Korean word for casually stepping out into the
neighborhood. We built it for people for whom that small trip is no longer
easy—and for whom the web has never been a real alternative.

## WebMCP: The New Accessibility Standard

> **The person brings the intent. Their Agent understands it. WebMCP turns it
> into something they can see, shape, and control.**

MASIL lets an older adult use a rich creative web experience without needing
to know how the web works. Korea's
[2025 national digital-divide survey](https://www.nia.or.kr/site/nia_kor/ex/bbs/View.do?bcIdx=29168&cbIdx=81623)
shows why this matters: with the general population indexed to 100, older
adults scored `95.4` for digital access but only `56.2` for digital capability.
MASIL targets that missing layer between access and agency—the ability to
achieve, inspect, correct, and control an outcome without first learning the
interface. The evidence and its limits are documented in
[Evidence and Korean context](docs/EVIDENCE.md).

- The **Agent understands the person first**—their ordinary words, phrasing,
  and conversational context—then acts as a creative assistant by generating a
  calligraphy reference, responding in Janggi, or helping them continue.
- **WebMCP makes MASIL usable through that Agent.** It exposes the exact canvas,
  board, rules, available actions, permissions, and recovery paths, so the
  person does not have to learn menus or web conventions first.
- The **web interface is the creative space itself—not a control panel.** It is
  where references, brushstrokes, Janggi positions, and direct gestures remain
  visible across turns. The Agent can understand intent; the shared web space
  is where the person and Agent make something together.

The person keeps the intent, authorship, and final say. The Agent and
WebMCP carry the burden of understanding and operating the interface.

| Approach | What it enables—and where it stops |
| --- | --- |
| Generic voice assistant | It can talk about calligraphy and Janggi, but on its own it provides no live writing space, persistent brushstrokes, visible board, or shared moves. If an older adult cannot open and operate another app, voice alone still leaves them excluded. |
| Fixed accessible UI | It can enlarge controls, but the person must still learn each activity's controls and remain inside predetermined content and flows. |
| **MASIL (Agent + WebMCP)** | The Agent understands and supports the person's creative intent; WebMCP lets it operate MASIL's exact live creative space. The person can make, continue, and control the activity without first learning the interface. |

The completed challenge experience carries one Agent relationship from
generative calligraphy to conversational Janggi and, only by explicit choice,
through a consent-safe local handoff and back to the preserved activity.

## When Creative Life Loses Its Place

> **The problem is not that older adults lack creative lives. It is that the
> places supporting those lives can become unreachable.**

For many older Koreans, creative life has familiar places: a calligraphy table
at a neighborhood welfare center or a Janggi board surrounded by people who
watch, challenge, and talk. Korea's 2025 senior-welfare guidance lists both
among the hobby and cultural activities offered through senior welfare centers.

That access is fragile. Stairs, public transit, or distance can put a community
program beyond reach. In 2025, Janggi was prohibited and every board was
removed from Seoul's Tapgol Park, ending a free gathering scene reported as a
30-year tradition. For an older adult living alone, losing the place can mean
losing both the activity and a recurring point of human contact.

The web should open another route. But for someone who cannot navigate menus,
modes, and controls, a conventional website becomes a second locked door. The
physical place is out of reach, and its digital alternative is impossible to
enter.

MASIL opens that second door through the person's Agent. “추석을 한자로 쓰고
싶어” becomes an Agent-generated `秋夕` reference inside a live air-writing
canvas. “왼쪽 차 위로 쭉” becomes a move on the exact visible Janggi board and
a response from the Agent. WebMCP turns ordinary speech into continued access
to a shared creative space, while the person remains its author and
decision-maker.

MASIL does not claim that a website replaces a community. It preserves access
to a chosen part of creative life when the community cannot be reached.

Sources: [2025 senior-welfare program guidance](https://www.kcpass.or.kr/fileDownload?fileDownType=C&fileId=3&paramMenuId=MENU002030702000000&titleId=9vRotzVdm8),
[Tapgol Park reporting](https://v.daum.net/v/20250825200046781), and
[mobility analysis based on the 2023 National Survey of Older Persons](https://repository.kihasa.re.kr/bitstream/201002/46105/1/2024.11.No.337.06.pdf).

## Why MASIL Belongs in the WebMCP Challenge

| [Judging criterion](https://webmcp.devpost.com/rules) | MASIL's answer |
| --- | --- |
| **WebMCP Leverage** | The Agent understands the person's words; MASIL's WebMCP tools place generated work, read the exact Janggi position, and change the live creative state. Without that semantic bridge, the Agent can discuss the activity but cannot reliably enter and continue the exact shared state. |
| **Execution** | The completed demo carries one Agent relationship across calligraphy and Janggi. Agent tool calls and direct touch update the same visible state, so the person can see, continue, and control the experience. |
| **Potential Impact** | MASIL addresses a specific double exclusion facing older Koreans living alone: familiar creative spaces can become physically unreachable while conventional web alternatives remain digitally inaccessible. Through WebMCP, their own Agent provides a person-controlled route back into those activities. |
| **Creativity & Ambition** | MASIL demonstrates an agent-mediated accessibility layer: instead of requiring interface literacy, it lets the person use a provider-declared creative space through their own Agent while keeping the visible outcome under human control. |

## Beyond the Creative Space

MASIL begins with creativity, not welfare intake. But if the person explicitly
asks for human help, the same person-controlled channel can keep their story
from disappearing between a conversation and a public-service workflow.

The public-service constraint is finite human time. As of August 2025, Korea's
customized-care system reported about
[550,000 vulnerable older adults, 2,600 dedicated social workers, and 35,000
frontline care workers](https://www.1661-2129.or.kr/sub05/sub01/sub01.php).
The [2026 operating guidance](https://www.1661-2129.or.kr/download/2026%EB%85%84%20%EB%85%B8%EC%9D%B8%EB%A7%9E%EC%B6%A4%EB%8F%8C%EB%B4%84%EC%84%9C%EB%B9%84%EC%8A%A4%20%EC%82%AC%EC%97%85%EC%95%88%EB%82%B4.pdf)
requires staff to receive applications, arrange visits, listen and clarify,
record needs, plan services, monitor delivery, and reassess. These figures do
not by themselves prove a nationwide staffing shortage. They do show why
repeated intake, transcription, and missing-information follow-up consume
finite time that should be protected for judgment and care.

A [2025 peer-reviewed case](https://www.kihasa.re.kr/hswr/assets/pdf/1560/journal-45-2-78.pdf)
shows how a blind spot can remain even after the need is understood. An
80-year-old man living alone documented his assets and living situation with
help, and a village care manager delivered the signed statement because travel
was difficult. The local office still required him to appear in person; he
hesitated, and the support linkage stopped.

MASIL cannot decide eligibility, override an agency's attendance requirement,
or infer a welfare need from silence or inactivity. It can preserve the
person's own words, turn only approved details into a correctable support
draft, show what is still missing, and return a visible next step. Together,
the Agent and WebMCP preserve continuity; human staff keep professional
assessment, exceptions, official decisions, and the human care the system
exists to provide.

The challenge demo completes this flow end to end. Its designed endpoint is a
clearly labeled local handoff: the person can review, confirm, receive a result,
and return to the preserved activity, while no external institution is
contacted. Partner-operated community-center connections and measured service
outcomes are separate expansion horizons in [Long-term vision](docs/VISION.md).
The complete consent, safety, and service boundary is documented in
[Person-first service design](docs/SERVICE-DESIGN.md).

## Documentation

- [Product definition](docs/PRODUCT.md) — the person, product hierarchy,
  creative journey, authority, and non-goals
- [Evidence and Korean context](docs/EVIDENCE.md) — source ledger and evidence
  limits
- [Person-first service design](docs/SERVICE-DESIGN.md) — the optional
  human-support flow and public-service boundary
- [WebMCP design contract](docs/WEBMCP.md) — tool catalog, shared state,
  calligraphy asset contract, Janggi turns, confirmations, and recovery
- [Long-term vision](docs/VISION.md) — how MASIL could extend this new
  accessibility layer without becoming surveillance

## License

MASIL is licensed under the [MIT License](LICENSE). Third-party software,
fonts, and media retain their own licenses. Notices are included only for
materials actually distributed in this repository.
