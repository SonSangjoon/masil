# Immutable evaluation iterations

This directory retains the approved evidence range from `iteration-001`
through `iteration-025`. No later attempt is part of the published record.

`iteration-001` is the complete no-WebMCP control and contains no `artifact/`.
`iteration-002` through `iteration-025` each evaluate one WebMCP candidate and
preserve that candidate's exact `src/features/webmcp/` code in a flat
`artifact/` directory. `iteration-008` is the final retained candidate.

Each completed `iteration-*` directory is immutable. Its case paths are
`cases/<case-id>/<repetition>/`, and its manifest, benchmark, timing, grades,
final responses, and source snapshot remain together as one inspectable result.
The frozen task and assertion contract is
[`evals/evals.json`](../evals.json).

Incomplete or exploratory work belongs under ignored `evals/.raw/` staging
space and is never part of this evidence set.
