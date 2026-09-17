# Direction leave-one-out sensitivity: resumable checkpoint

Status: PARTIAL PIPELINE VALIDATION, not a completed 80-node study.

The previous subset study is committed as ad386df. This follow-up retains
its own fixed plan and does not change runtime, connectome or earlier reports.
The historical `l2o` filename means leave-ONE-out here, not leave-two-out.

## Interpretation boundary

Deleting an entry shortens a rotating list and reassigns later RNG draws to
other nodes. This is source-list deletion sensitivity, NOT an isolated test
of neuronal necessity/sufficiency. Nodes remain in the graph and can still
receive recurrent input. Equal 22-node selection counts and RNG calls do not
imply equal effective or cumulative current. The earlier subset results also
cannot distinguish identity changes from RNG-to-node reassignment.

## Verified in this session

- Unmodified subset and holdout runners: seed 102, 16 scenarios / 32 arms,
  directional 8, neutral 4, net +4. Inputs, selected nodes, budgets, paths,
  events and final states agree with each other and the saved subset report.
- Fixed new seeds 201-204, four headings, four placements, 36 ticks:

| Block | directional | neutral | W / T / L vs neutral | net margin |
| --- | ---: | ---: | --- | ---: |
| Full cohort | 16/64 | 16/64 | 0 / 64 / 0 | 0 |
| Exclude graph index 374 | 16/64 | 20/64 | 0 / 60 / 4 | -4 |

Only 2 of 81 blocks completed: full-cohort control and one exclusion.
256 arm runs were each rerun and fully compared in memory; control paths,
events and final states also matched the original holdout runner.
The saved compact records retain paths, events, state hashes and trace hashes;
full trace verification requires rerunning the recorded scenario.

The new-seed control has NO directional advantage. The first exclusion
increases neutral collection, not decreases directional collection. Do not
claim this identifies a node carrying the prior advantage. Do not change the
seed pool or select nodes after this result to recover a positive effect.
Rotations are correlated; four losses are not four independent seed effects.

Checkpoint checksum and source/plan/graph binding were verified by reloading.
Event totals and paired margins were independently recomputed. A zero-new-block
resume produced exactly the same summary. Unit tests: 4/4; workspace: 287/287.
No build was run for this offline-script-only checkpoint.

## Current handoff: paused

A later baseline recheck failed at `verifySideFile` with `PATH_SIDE_BINDING`
before any simulation. Its cause has not been established. Do not bypass the
binding guard or claim that this later recheck reproduced seeds 101-108.
The successful checks above describe the earlier checkpoint run, not current
graph compatibility. The current focused tests pass 12/12, but fixture/report
tests do not establish that the live graph and side file still match.
Resolve provenance compatibility before attempting any further study.

Follow-up diagnosis (no simulation): the working tree subsequently contained
an uncommitted 12,000-node / 477,021-edge graph and a modified side file;
their binding check now passes. The precise transient file-update ordering
behind the earlier failure is unknown. An isolated archive of c823e40 passes
binding with the historical 1,400-node / 42,031-edge graph. Both old reports
bind the committed binary, not the current working-tree binary:

- Historical SHA256: `4278c3cae84471b8a808391d5de5eddf8e54a2b75e01f8596743ec07e2f1e843`
- Working-tree SHA256 at diagnosis: `e269ed3d16c7f08a3e035e37edb44c8f30b96480646f865d960eb2e02388f64b`

No data was reverted, no binding was bypassed, and no runtime defect was
established. Reproduce old reports against their committed historical dataset;
a newer graph requires a separate versioned study, not relabeling old results.

The practical conclusion remains seed/order sensitivity, not robust navigation
or isolated node attribution. Larger validation and the 80-node scan are paused.

Frontend entry points checked over HTTP (200, not browser-render validation):
- http://127.0.0.1:5178/brain.html — connectome/runtime observation page.
- http://127.0.0.1:5178/live.html — separate 3D live simulation.
Neither is a frontend for these offline direction studies; no study dashboard
has been implemented in this work.

## Resume without timeout

Each block is atomically saved after all its runs and replays complete. The
binding includes the runner and dependencies; stale or corrupted checkpoints
fail closed. A changed binding uses a separate directory. Run only one writer
at a time. An interrupted block reruns; already completed blocks are reused.

```sh
node /Users/caonanya/Documents/ChatGPT/immoratalflies/scripts/study-direction-l2o.mjs --max-blocks 2
node /Users/caonanya/Documents/ChatGPT/immoratalflies/scripts/study-direction-l2o.mjs --max-blocks 0
node --test /Users/caonanya/Documents/ChatGPT/immoratalflies/tests/direction-l2o.test.mjs
```

`--max-blocks` caps NEW blocks per invocation, not total completed blocks.
Only a full 81-block completion writes the final study report. No final report
exists yet. Checkpoints are local intermediate evidence, not a completed study.

Current binding:
`0x451c8e49bb5eeac52351c0957e2aad50ef5fbd5190a1fc494ebb43a92e4c1fd1`

Checkpoint directory:
`/Users/caonanya/Documents/ChatGPT/immoratalflies/reports/direction-l2o-checkpoints/451c8e49bb5eeac52351c0957e2aad50ef5fbd5190a1fc494ebb43a92e4c1fd1/`
