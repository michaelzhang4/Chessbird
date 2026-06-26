# Plan: chess.com game importer + Stockfish tactic mining

## Context
Chessbird's content so far comes from Lichess (studies + puzzle DB). The highest-value,
fully-legitimate content the user (chess.com handle **Jendire**) can train on is **their own
games** — positions where a tactic existed, turned into puzzles. This adds a new importer,
`scripts/import-mygames.mjs`, plus a `cb mygames` subcommand, reusing the existing
build→validate→write→`rebuildManifest` pattern. Output is a normal `woodpecker-set@1` set that
flows through the existing Pool / Practice / Woodpecker UI.

**Hard constraint discovered:** `src/lib/board/boardController.ts` `isCorrect()` accepts a solver
move **only by exact match**, except a checkmating move on the final ply. So mined puzzles must be
**short, forcing lines** with opponent replies taken **verbatim from the engine PV**, and the best
move must be uniquely winning. The detector is built around this.

**User choices:** engine provided via `STOCKFISH_PATH` (no auto-download); **rapid, rated** games
only by default; keep **all the user's tactical chances** (found + missed), user-to-move only.

## New file: `scripts/import-mygames.mjs`
Mirror `scripts/import-opening-puzzles.mjs` (build/validate/write/`rebuildManifest`) and reuse
`posKey`/`puzKey` from `scripts/lib/study.mjs`. Node ESM, global `fetch`, top-level await.

### CLI
```
node scripts/import-mygames.mjs <user> [setId] ["Title"] [flags]
cb.cmd mygames <user> ...           # added to scripts/cb.ps1 switch
```
Defaults reflecting the choices:

| Flag | Default | |
|---|---|---|
| `setId` | `chesscom-<user>-tactics` | output file id |
| `--time-class <list>` | `rapid` | rapid only |
| `--rated` | on | rated games only |
| `--months <n>` | `4` | recent archive months to scan |
| `--max-games <n>` | `150` | cap games analyzed |
| `--max-puzzles <n>` | `80` | cap set size |
| `--side <me\|both>` | `me` | user-to-move positions (flag enables opponent-side) |
| `--skip-plies <n>` | `12` | skip the opening |
| `--depth <n>` | `16` | main multipv pass |
| `--prefilter-depth <n>` | `8` | cheap pass; `0` disables |
| `--cp-threshold <cp>` | `200` | "decisively winning" |
| `--gap <cp>` | `150` | best−second "only move" gap |
| `--prev-margin <cp>` | `100` | skip if already winning before the move |
| `--max-line-plies <n>` | `6` | cap solution length |
| `--threads`/`--hash` | cores-1 / 128 | engine options |
| `--stockfish <path>` | env `STOCKFISH_PATH` | **required** engine binary |
| `--dry-run` | off | detect + report, don't write |

### 1. Fetch chess.com games
- `GET https://api.chess.com/pub/player/<user-lowercased>/games/archives` → monthly URLs; take the
  last `--months`, fetch newest-first. **Send a descriptive `User-Agent`** (403 without one);
  retry/backoff on 429/5xx like `fetchStudyPgn` (study.mjs:19-33); 404 = unknown user → clear exit.
- Per game filter: `rules==='chess'` (drop variants), `rated` (if set), `time_class` in list. Skip
  games with a `[Variant]`≠Standard or non-standard `[SetUp]`/`[FEN]` (Chess960 leaks), and games
  shorter than `--skip-plies`. Detect user color by case-insensitive username match.
- Parse with chess.js: `new Chess(); loadPgn(pgn); history({verbose:true})`, then replay from a
  fresh `Chess()` to capture `(fenBefore, sideToMove, playedUci, ply)` at each ply. try/catch around
  `loadPgn` (skip odd PGNs). Polite ~400ms sleep between archive fetches.

### 2. Stockfish UCI driver (provided binary)
- Resolve engine from `--stockfish`/`STOCKFISH_PATH`; if missing, **exit with install hint**
  (`winget install Stockfish`, or download from stockfishchess.org, then set `STOCKFISH_PATH`).
- One long-lived `child_process.spawn`; read stdout via `readline` (line-safe). Init once: `uci`→
  `uciok`; set `Threads`,`Hash`,`MultiPV`; `isready`→`readyok`. Per position: `ucinewgame`,
  `position fen <fen>`, `go depth <D>`, accumulate `info` into a `Map<multipv,{depth,cp,mate,pv}>`
  (overwrite per pv with deepest line; **skip `lowerbound`/`upperbound` infos**), resolve on
  `bestmove`. **Serialize analyses** (one `go` outstanding). Scores are side-to-move POV; map
  `mate X` → signed sentinel preserving order. Per-`go` watchdog (`stop` + skip on hang); handle
  engine `exit`.

### 3. Tactic detection (per user-to-move position, `ply>=skip`)
Two-pass for speed: **prefilter** `go depth 8` MultiPV=1, keep only `e1>=cpThreshold` or mate; then
**confirm** `go depth 16` MultiPV=2 and flag a tactic when:
- `e1 >= cpThreshold` (or `m1` mate for solver), **and**
- `e1 - e2 >= gap` (or `m1` mate & `m2` not), **and**
- `e2 < cpThreshold` (second-best does **not** also win → first move is the unique winning move), **and**
- the position was **not already winning** before the user's move (prev eval `< prevMargin`; anti-trivial).

Solution = MultiPV-1 **PV verbatim** (opponent replies included), converted to UCI, **truncated** at
the move that first establishes a decisive score or at mate, capped to `--max-line-plies`; replay
through chess.js (like import-opening-puzzles.mjs:48-53) and **skip** on any illegality. Build puzzle:
`{ fen, moves, setupMoveFirst:false, solverColor:userColor, themes, source:'chess.com',
sourceUrl:game.url, rating }`. Themes: `'found'`/`'missed'` (vs `playedUci`), `'mate'` if line mates.
Rating: approximate from the player's game rating (kept explicitly approximate in the description); or
omit. Dedup by `posKey`.

### 4. Output (mirror import-opening-puzzles.mjs:96-108)
Sort (missed-first, then by sharpness), cap to `--max-puzzles`, assemble `woodpecker-set@1`
(`source:'chess.com'`, description noting user/months/games/found-missed counts + approximate
ratings), write `static/data/sets/<setId>.json`, call `rebuildManifest(root)`. `--dry-run` prints the
report only.

## Other edits
- **`scripts/cb.ps1`**: add `'mygames' { node scripts/import-mygames.mjs @rest }` to the switch
  (cb.ps1:43-49) + a help line.
- **`CONTENT.md`**: add a "Mine your own games" recipe (set `STOCKFISH_PATH`, run
  `cb mygames Jendire`, then `cb deploy`).
- Engine binary is **never committed** (user-provided path); no repo/data churn beyond the new set
  file. No `.gitignore` change needed (no auto-download).

## Verification
1. `node scripts/import-mygames.mjs Jendire jendire-test "Jendire Test" --max-games 3 --max-puzzles 5 --dry-run`
   → confirms fetch + filter + engine + detection without writing; inspect the printed report.
2. Real run (small) → writes `static/data/sets/jendire-test.json`; confirm it loads (zod
   `setFileSchema`) and appears in the library.
3. **Solvability** via the existing Playwright harness pattern (`scripts/e2e-verify.mjs`):
   `cb preview` → drive `/set/jendire-test` → skip assessment → `/solve`, play `moves[0]` (and
   `moves[2]…` if multi-ply) by pixel-clicking squares, assert the `Cycle 1 · x/y` counter advances
   with no "Not the move" toast — proves detection respects `isCorrect`.
4. Hand-check a couple of puzzles by opening `sourceUrl` (the chess.com game) to confirm the tactic
   is real and forcing.
5. Clean up the test set (delete file → `cb manifest`) before mining the full set with
   `cb mygames Jendire` + `cb deploy`.

## Risks
- Exact-match solving → mitigated by short forced lines + `e2<cpThreshold` uniqueness + verbatim PV.
- chess.com 403 (missing UA) / 404 (bad user) / rate limits → UA + backoff + clear errors.
- Engine CPU-tier crash is the user's concern now (they provide the binary); script just validates
  `uciok` and errors cleanly if the engine won't start.
- Runtime: prefilter keeps a ~150-game rapid run to a few minutes; `--depth 14`/`--max-games` tune it.
