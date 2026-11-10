# Experimental WASM Worker and convergence checks

This directory is private by default. Its `.gitignore` exposes only an explicit
allowlist of reviewed generic source, synthetic tests and reproducible build
scripts. Purchased data, extraction/inspection utilities, internal integration
notes, generated reports, manifests, result JSON, dependency directories, browser
profiles, archives, binaries and build caches remain local and excluded from Git.
Do not broaden the allowlist to publish local benchmark outputs.

Local investigation instructions are preserved in `README.local.md`, which is
intentionally ignored along with the other internal material. That material is
not part of the public deliverable. No purchased ranges or derived action EV
tables are included in the public source/test files.

## Public checks

From the repository root:

```powershell
node benchmark/check-public.mjs
node --test benchmark/m3.test.mjs
```

The first check audits tracked and currently eligible untracked files. It rejects
benchmark paths outside the explicit allowlist, common credential signatures,
local credential filenames and archive-specific purchased-data markers. It also
verifies ignore rules for representative private output paths. It prints only
file locations and issue categories, never matching credential values. This is
a local review aid; ignore rules can be bypassed with `git add -f` and neither
check replaces review of the exact staged diff before any future commit.

## Reproducible build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File benchmark/build-pinned.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File benchmark/build-corrected.ps1
```

Requires Docker and network access for the pinned compiler/dependencies. Builds
start from the pinned upstream Git archive. The corrected build overlays only
the convergence predicate/docs, synthetic regressions and evaluator binding;
DCFR remains unchanged. Source/binary identities are written to ignored local
manifests. Disposable containers use project bind mounts and `--rm`; no volume
or Docker-settings changes are required. Generated WASM files are not published
by this directory's Git policy.

## Generic interface

`PersistentTurnProvider` accepts caller-supplied weighted ranges, retains a turn
solution in a Worker and exposes specific-combo queries, action navigation, river
dealing, release, cancellation/recovery and actual-card settlement. Deploy the
client, Worker, confidence module and corrected WASM/glue in an `artifacts`
subdirectory together; asset URLs resolve relative to the modules. Never deploy
private fixtures or raw result files. Worker replies contain requested values
and public state rather than complete serialized solution trees.

The grading gate is an experimental two-solve stability heuristic. Strategy
estimates and diagnostic EVs are separate from conditional grade evidence;
default decisions remain ungraded. Global convergence is not a per-combo grading
certificate. Cancellation terminates the Worker and loses retained handles;
release frees handles but does not shrink WASM linear capacity. Reference solves
block queries on their own Worker, so schedule them separately from active play.
