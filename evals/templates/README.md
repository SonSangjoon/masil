# Evaluation workspace template

`iteration/` is the empty workspace skeleton used by the evaluation runner.
It exists so the retained layout is reviewable before any paid run begins,
without creating a false `evals/iterations/iteration-001` result.

The runner copies this template into ignored staging space, writes every case
run, removes the `.gitkeep` marker, and moves the completed directory into
`evals/iterations/` atomically. Candidate iterations add `artifact/` at run
time; the no-WebMCP `iteration-001` has no WebMCP artifact to preserve.

After a complete run, the skeleton becomes:

```text
iteration-N/
├── artifact/                         # candidate iterations only: exact WebMCP code
├── cases/
│   └── <case-id>/
│       └── <repetition>/
│           ├── outputs/
│           │   └── final-response.txt
│           ├── timing.json
│           └── grading.json
├── manifest.json
├── benchmark.json
```

The runner keeps detailed execution, tool-trace, transcript, screenshot, and
raw model output in ignored `evals/.raw/` working data. The publish command
removes those private or redundant copies from `iteration-N/` before Git
review, leaving only timing, assertion grades, the final person-facing reply,
and the exact candidate source snapshot.

The dynamic case and repetition directories are not pre-created because their
names and count come from the locked `evals/evals.json` at run time.

Conversation quality is not a separate artifact. Its clean-context LLM verdict,
five rubric scores, and quoted evidence are stored under
`CONVERSATION-QUALITY-001` in each run's `grading.json`.
