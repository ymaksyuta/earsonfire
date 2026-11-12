# earsonfire — notes for ChatGPT

This is the onboarding doc for a fresh session. Read this first; it
points to the deeper docs rather than duplicating them, and captures
the actual working practice on this project.

## What this is

MIT-licensed PWA for woodwind fingering training: loads a MIDI file,
renders standard notation, plays it back, and shows a fingering diagram
synced to playback. Primary target is mobile/Android, offline-capable.
Sole developer: Yury (GitHub `ymaksyuta`). Full concept: `dev/concept.txt`.
Longer-term roadmap: `dev/roadmap.txt`.

## Read before touching code

- `dev/notes.txt` — the real architecture doc: module layout, state
  ownership, and the reasoning behind several non-obvious pieces.
  Keep it updated when the shape of the code changes.
- `dev/concept.txt` — gameplay/product concept, kept short and current.
- `dev/ai_coworker_instructions.txt` — process rules, including when
  to ask before architecturally significant work.

## Environment and workflow

The canonical integration and release branch is `main`.

- Clone the repository and start from the latest `main`:
  ```
  git clone https://github.com/ymaksyuta/earsonfire
  cd earsonfire
  git checkout main
  git pull --ff-only
  ```
- Commit completed work to `main`. You may create temporary local
  branches while developing a feature if that makes the work safer or
  easier; merge the finished work back into `main` before considering
  the task complete. Do not leave completed feature work only on a
  development branch.
- When local Git access is unavailable, use the connected GitHub App
  to read and write repository content. Prefer Git objects
  (blobs/trees/commits and a guarded ref update) if the Contents API
  is unavailable. Never request a PAT merely to work around an API
  route that is blocked when another authorized GitHub App route works.
- Before updating a branch ref, inspect its current head and use an
  expected-SHA/lease check so concurrent changes are not overwritten.
  Never force-push or rewrite shared branch history.
- Set identity before local commits:
  `git config user.email ymaksyuta@gmail.com` and
  `git config user.name ymaksyuta`.
- End every commit message with a separate line reading
  `using GPT-6` (or the actual model name in use).
- Ask clarifying questions before architecturally significant or
  ambiguous work, per `dev/ai_coworker_instructions.txt`.

## Verifying changes

Always finish with `npm run build` in `application/` before
committing, when a local build environment is available. Remove
generated `dist/` output and scratch test files before committing.
There is no guarantee of a browser or full automated test suite;
choose focused checks appropriate to the changed code and report
which checks actually ran.

For VexFlow/notation changes, useful checks include the real-world
stress case `media/Vabank.mid`: no crashes across playable tracks,
`noteX` has no undefined entries and matches the expected note count,
and no rendered item's bounding box exceeds its stave's right edge.

## Known simplifications

Don't change these without checking whether they're intentional scope
limits first; consult `dev/notes.txt` and the relevant source comments
because this list can become stale:

- Single time signature per file (first one wins; no mid-piece meter
  change support).
- Rest/note durations snap to the nearest power-of-two value, not a
  measure-accurate rhythm transcription; a note crossing a barline
  isn't split into tied notes.
- No note-count cap on the score; the whole track/selection is rendered.
- Polyphonic rendering and monophonic-reduction behavior are described
  in `dev/notes.txt`; inspect current implementation before assuming
  which strategies are implemented.
- Tempo changes apply on next Play, not live mid-playback.
