# earsonfire — notes for Claude

This is the onboarding doc for a fresh session. Read this first; it
points to the deeper docs rather than duplicating them, and captures
the actual working practice on this project (some of which supersedes
older written instructions — noted below).

## What this is

MIT-licensed PWA for woodwind fingering training: loads a MIDI file,
renders standard notation, plays it back, and shows a fingering diagram
synced to playback. Primary target is mobile/Android, offline-capable.
Sole developer: Yury (GitHub `ymaksyuta`). Full concept: `dev/concept.txt`.
Longer-term roadmap: `dev/roadmap.txt`.

## Read before touching code

- `dev/notes.txt` — the real architecture doc: module layout, state
  ownership, and the reasoning behind several non-obvious pieces
  (rest/measure rendering, track-name resolution, multi-track
  combining, the monophonic-reduction strategies). Keep it updated
  when the shape of the code changes — it goes stale fast otherwise,
  and a stale architecture doc is worse than none.
- `dev/concept.txt` — gameplay/product concept, kept short and current.
- `dev/ai_coworker_instructions.txt` — process rules (ask before
  architecturally significant work, etc.). One piece of it is now
  outdated: see "Workflow" below.

## Environment and workflow

This session type has a real filesystem, `bash`, and `git` — clone the
repo fresh each session:

```
git clone https://github.com/ymaksyuta/earsonfire
cd earsonfire && git checkout dev   # active branch; main is merged manually
```

Given that, work directly against the clone rather than the git-am
patch-file workflow `dev/ai_coworker_instructions.txt` describes — that
instruction predates code-execution access in this kind of session and
is superseded here. (If a future session genuinely has no shell/git
access, fall back to producing `git format-patch`-style patches
instead.)

- Set identity before committing: `git config user.email
  ymaksyuta@gmail.com && git config user.name ymaksyuta`.
- Commit directly on `dev`. End every commit message with a line
  reading `using <model name>` (e.g. `using Claude Sonnet 5`), per
  `ai_coworker_instructions.txt`.
- This clone has no push credentials. To push, ask the user for a
  short-lived GitHub PAT (fine-grained, scoped to this repo,
  **Contents: Read and write** — the most common failure mode is a
  token scoped read-only, which fails push with a 403). Use it once
  inline in the push URL, never write it to a file or `git config`,
  and tell the user to revoke it right after. Don't ask them to paste
  a token unless they've already offered one for this purpose — flag
  the exposure risk once, then respect their call.
- `main` is merged manually by the user via GitHub's PR UI, not by
  Claude. Don't push to `main` directly.
- Ask clarifying questions before architecturally significant or
  ambiguous work, per `ai_coworker_instructions.txt` — this one still
  holds.

## Verifying changes (no browser here)

There's no test suite and no headless browser. The pattern that's
worked well for VexFlow/notation changes in this session:

```
npx esbuild src/core/notation.js --bundle --format=esm --platform=node \
  --external:vexflow --outfile=./_test_notation.mjs
```

then a scratch Node script using `jsdom` for `document`/`SVGElement`
(VexFlow's SVG backend needs a DOM, not a full browser) — install
`jsdom` with `npm install --no-audit --no-fund jsdom` if it's not
already a devDependency, but **revert that dependency addition before
committing** if it was only for testing; it isn't a real app
dependency. Run scratch scripts from inside `application/` so
`node_modules` (vexflow, `@tonejs/midi`) resolves. Delete
`_test_*.mjs` files and any `dist/` output before committing — they're
scratch, not deliverables.

Good things to check after a notation.js change, using
`media/Vabank.mid` as the real-world stress case (see track breakdown
below): no crashes across all playable tracks, `noteX` has no
`undefined` entries and matches the expected note count, and — if
touching stave/width logic — no item's VexFlow bounding box exceeds
its stave's right edge (this caught a real bug once; see git log
"barline").

For plain logic (no VexFlow), a bundled `_test_*.mjs` plus a plain
`node -e "..."` script is enough, no jsdom needed.

Always finish with `npm run build` in `application/` before
committing, and `rm -rf dist` after — it's not meant to be committed.

## Reference file: media/Vabank.mid

Useful for smoke-testing without needing a user-supplied file. Through
`parseMidiFile` (after name resolution), the 6 playable tracks are:

```
0  Piano                     1736 notes
1  Sassofono contralto        571 notes   (alto sax)
2  Clarinetto contralto       487 notes   (clarinet — the app's first
                                            real instrument target)
3  Sassofono tenore           500 notes   (tenor sax)
4  Basso elettrico 5 corde    355 notes   (bass)
5  Batteria                  1325 notes   (drums)
```

Time signature: 2/2 (cut time), constant throughout, ppq 480.

## Known simplifications (deliberate, documented in dev/notes.txt)

Don't "fix" these without checking they're not intentional scope
limits first:

- Single time signature per file (first one wins; no mid-piece meter
  change support).
- Rest/note durations snap to the nearest power-of-two value, not a
  measure-accurate rhythm transcription; a note whose performed
  duration crosses a barline isn't split into tied notes.
- `MAX_NOTES_RENDERED` caps the score at 64 notes for render
  speed/legibility.
- Simultaneous notes across combined tracks are not chorded — see
  `resolveMonophonic.js`. Two of its three strategies ('primary',
  'autodetect') are UI-only placeholders that fall back to 'shorter'
  internally; only 'shorter' is actually implemented as of this
  writing. Check `dev/notes.txt` and `resolveMonophonic.js`'s own
  comments before assuming otherwise — this is exactly the kind of
  thing that goes stale if not rechecked.
- Tempo changes apply on next Play, not live mid-playback.
